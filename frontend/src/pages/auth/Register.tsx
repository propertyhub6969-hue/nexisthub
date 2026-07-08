import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import type { RegisterPayload } from '../../types'
import BrandPanel from './BrandPanel'

export default function Register() {
  const { register: registerUser } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [doneSlug, setDoneSlug] = useState<string | null | undefined>(undefined)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterPayload>()

  const onSubmit = async (data: RegisterPayload) => {
    setError('')
    try {
      const me = await registerUser(data)
      setDoneSlug(me.tenant_slug ?? null)
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Pendaftaran gagal. Coba lagi.')
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />

      <div className="flex items-center justify-center p-6 sm:p-10 bg-slate-50">
        <div className="w-full max-w-sm">
          {doneSlug !== undefined ? (
            <div className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-accent-500/10 flex items-center justify-center mb-4">
                <CheckCircle2 size={26} className="text-accent-500" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Outlet Anda siap</h1>
              <p className="text-sm text-slate-500 mt-1 mb-5">Trial gratis 14 hari sudah aktif.</p>
              {doneSlug && (
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 mb-5 text-left">
                  <p className="text-xs text-slate-500">Alamat khusus Anda</p>
                  <p className="font-display font-semibold text-brand-700 break-all">{doneSlug}.nexisthub.id</p>
                </div>
              )}
              <button onClick={() => navigate('/login')} className="btn-primary w-full py-2.5">Lanjut Masuk</button>
            </div>
          ) : (
            <>
              <p className="lg:hidden text-center font-display text-2xl font-bold text-slate-900 mb-8">
                Nexist<span className="text-brass-500">Hub</span>
              </p>

              <h1 className="text-2xl font-bold text-slate-900">Buat akun</h1>
              <p className="text-sm text-slate-500 mt-1 mb-7">Mulai trial gratis 14 hari — tanpa kartu kredit.</p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="label">Nama Lengkap</label>
                  <input className="input" type="text" placeholder="Ahmad Fauzi"
                    {...register('full_name', { required: 'Nama wajib diisi' })} />
                  {errors.full_name && <p className="text-xs text-red-500 mt-1">{errors.full_name.message}</p>}
                </div>
                <div>
                  <label className="label">Nama Perusahaan</label>
                  <input className="input" type="text" placeholder="PT. Maju Jaya Properti"
                    {...register('company_name')} />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" placeholder="nama@perusahaan.com"
                    {...register('email', {
                      required: 'Email wajib diisi',
                      pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Format email tidak valid' },
                    })} />
                  {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
                </div>
                <div>
                  <label className="label">Password</label>
                  <input className="input" type="password" placeholder="Min. 8 karakter"
                    {...register('password', { required: 'Password wajib diisi', minLength: { value: 8, message: 'Minimal 8 karakter' } })} />
                  {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{error}</div>
                )}

                <button type="submit" disabled={isSubmitting}
                  className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
                  {isSubmitting && <Loader2 size={15} className="animate-spin" />}
                  {isSubmitting ? 'Mendaftarkan…' : 'Buat Akun'}
                </button>
              </form>

              <p className="text-center text-sm text-slate-500 mt-6">
                Sudah punya akun?{' '}
                <Link to="/login" className="text-brand-600 font-medium hover:text-brand-700 hover:underline">Masuk di sini</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
