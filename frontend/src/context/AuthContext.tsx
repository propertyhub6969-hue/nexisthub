import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { authService } from '../services/auth'
import type { LoginPayload, RegisterPayload, UserResponse } from '../types'

interface AuthContextValue {
  user: UserResponse | null
  isAuthenticated: boolean
  login: (payload: LoginPayload) => Promise<UserResponse>
  register: (payload: RegisterPayload) => Promise<UserResponse>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Auto-logout karena tidak aktif ──
// Access token 30 mnt & refresh token 7 hari akan terus menyegarkan sesi diam-diam,
// jadi tanpa ini user praktis tak pernah keluar. Timer ini memaksa keluar bila tak ada
// aktivitas selama 1 jam. Timestamp aktivitas disimpan di localStorage agar dibagi antar-tab
// dan tetap dihitung walau tab ditutup lalu dibuka lagi (mis. besok paginya).
const IDLE_LIMIT_MS = 60 * 60 * 1000                 // 1 jam
const ACTIVITY_KEY = 'last_activity'
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'] as const

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null)
  const isAuthenticated = authService.isAuthenticated()

  // Hydrate the current user (incl. role) whenever we hold a token.
  useEffect(() => {
    if (isAuthenticated && !user) {
      authService.me().then(setUser).catch(() => {})
    }
  }, [isAuthenticated, user])

  const login = useCallback(async (payload: LoginPayload) => {
    const token = await authService.login(payload)
    authService.setTokens(token)
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()))
    const me = await authService.me()
    setUser(me)
    return me
  }, [])

  const register = useCallback(async (payload: RegisterPayload) => {
    const newUser = await authService.register(payload)
    setUser(newUser)
    return newUser
  }, [])

  const logout = useCallback(() => {
    authService.clearTokens()
    localStorage.removeItem(ACTIVITY_KEY)
    setUser(null)
    window.location.href = '/login'
  }, [])

  const idleLogout = useCallback(() => {
    authService.clearTokens()
    localStorage.removeItem(ACTIVITY_KEY)
    setUser(null)
    sessionStorage.setItem('logout_reason', 'idle')   // dibaca halaman Login utk tampilkan notice
    window.location.href = '/login'
  }, [])

  // Pasang pemantau aktivitas + pengecek idle hanya saat sudah login.
  useEffect(() => {
    if (!isAuthenticated) return
    if (!localStorage.getItem(ACTIVITY_KEY)) localStorage.setItem(ACTIVITY_KEY, String(Date.now()))

    let lastWrite = 0
    const bump = () => {
      const t = Date.now()
      if (t - lastWrite < 15000) return               // throttle: tulis maks. tiap 15 dtk
      lastWrite = t
      localStorage.setItem(ACTIVITY_KEY, String(t))
    }
    const check = () => {
      const last = Number(localStorage.getItem(ACTIVITY_KEY) || 0)
      if (last && Date.now() - last > IDLE_LIMIT_MS) idleLogout()
    }

    check()                                            // cek segera (mis. tab dibuka lagi setelah lama)
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    const onVisible = () => { if (!document.hidden) check() }
    document.addEventListener('visibilitychange', onVisible)
    const interval = window.setInterval(check, 30000)  // cek tiap 30 dtk

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, bump))
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(interval)
    }
  }, [isAuthenticated, idleLogout])

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
