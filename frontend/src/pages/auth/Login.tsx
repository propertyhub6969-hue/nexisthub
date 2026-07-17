import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { authService } from '../../services/auth'
import { publicService } from '../../services/public'
import { currentTenantSlug, tenantUrl } from '../../utils/tenant'
import type { LoginPayload } from '../../types'
import BrandPanel from './BrandPanel'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  const slug = currentTenantSlug()
  const [brand, setBrand] = useState<string | null>(null)
  // datang dari pintu umum / baru daftar → email sudah diisikan + beri konteks
  const params = new URLSearchParams(window.location.search)
  const prefillEmail = params.get('email') ?? ''
  const fromApp = params.get('from') === 'app'
  const justRegistered = params.get('baru') === '1'
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    if (slug) publicService.tenantBySlug(slug).then((t) => setBrand(t?.name ?? null))
  }, [slug])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginPayload>({ defaultValues: { email: prefillEmail } })

  const onSubmit = async (data: LoginPayload) => {
    setError('')
    try {
      const me = await login(data)
      // Pintu umum (app.nexisthub.id): akun tenant TIDAK dipakai di sini — antar ke alamat Office Digital-nya sendiri.
      // Sesi tak bisa dibawa lintas origin (localStorage per-origin), jadi token dibuang & mereka masuk sekali di sana.
      if (!slug && !me.is_platform_admin && me.tenant_slug) {
        const url = tenantUrl(me.tenant_slug, `/login?from=app&email=${encodeURIComponent(data.email)}`)
        if (url) {
          authService.clearTokens()
          setRedirecting(true)
          window.location.href = url
          return
        }
      }
      if (slug && !me.is_platform_admin && me.tenant_slug !== slug) {
        authService.clearTokens()
        setError(`Akun ini bukan milik Office Digital "${slug}". Masuk lewat app.nexisthub.id atau subdomain Office Digital Anda.`)
        return
      }
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Login gagal. Coba lagi.')
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />

      <div className="flex items-center justify-center p-6 sm:p-10 bg-slate-50">
        <div className="w-full max-w-sm">
          {/* wordmark ringkas (mobile) */}
          <p className="lg:hidden text-center font-display text-2xl font-bold text-slate-900 mb-8">
            Nexist<span className="text-brass-500">Hub</span>
          </p>

          <h1 className="text-2xl font-bold text-slate-900">{brand ? `Masuk — ${brand}` : 'Selamat datang'}</h1>
          <p className="text-sm text-slate-500 mt-1 mb-7">
            {slug ? (brand ? `Portal ${brand}` : `Office Digital "${slug}"`) : 'Masuk untuk mengelola proyek properti Anda.'}
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" placeholder="nama@perusahaan.com"
                {...register('email', { required: 'Email wajib diisi' })} />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" placeholder="••••••••"
                {...register('password', { required: 'Password wajib diisi' })} />
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
            </div>

            {(fromApp || justRegistered) && !error && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700">
                {justRegistered
                  ? 'Akun berhasil dibuat. Ini alamat khusus Anda — silakan masuk untuk mulai.'
                  : 'Anda diarahkan ke alamat khusus Office Digital Anda. Masuk di sini, lalu simpan alamat ini sebagai bookmark.'}
              </div>
            )}

            {redirecting && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700">
                Mengarahkan ke alamat Office Digital Anda…
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{error}</div>
            )}

            <button type="submit" disabled={isSubmitting}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
              {isSubmitting && <Loader2 size={15} className="animate-spin" />}
              {isSubmitting ? 'Memproses…' : 'Masuk'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Belum punya akun?{' '}
            <Link to="/register" className="text-brand-600 font-medium hover:text-brand-700 hover:underline">Daftar sekarang</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
