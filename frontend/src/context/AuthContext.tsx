import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { authService } from '../services/auth'
import type { LoginPayload, RegisterPayload, UserResponse } from '../types'

interface AuthContextValue {
  user: UserResponse | null
  isAuthenticated: boolean
  login: (payload: LoginPayload) => Promise<void>
  register: (payload: RegisterPayload) => Promise<UserResponse>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

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
    const me = await authService.me()
    setUser(me)
  }, [])

  const register = useCallback(async (payload: RegisterPayload) => {
    const newUser = await authService.register(payload)
    setUser(newUser)
    return newUser
  }, [])

  const logout = useCallback(() => {
    authService.clearTokens()
    setUser(null)
    window.location.href = '/login'
  }, [])

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
