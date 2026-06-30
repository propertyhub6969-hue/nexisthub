import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import type { RegisterPayload } from '../../types'

export default function Register() {
  const { register: registerUser } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterPayload>()

  const onSubmit = async (data: RegisterPayload) => {
    setError('')
    try {
      await registerUser(data)
      navigate('/login?registered=1')
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Pendaftaran gagal. Coba lagi.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <img
            src="/brand.png"
            alt="Nexist Logo"
            className="h-32 w-auto"
          />
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Buat Akun</h2>
          <p className="text-sm text-slate-500 mb-6">
            Mulai trial gratis 14 hari — tanpa kartu kredit
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Nama Lengkap</label>
              <input
                className="input"
                type="text"
                placeholder="Ahmad Fauzi"
                {...register('full_name', { required: 'Nama wajib diisi' })}
              />
              {errors.full_name && (
                <p className="text-xs text-red-500 mt-1">{errors.full_name.message}</p>
              )}
            </div>

            <div>
              <label className="label">Nama Perusahaan</label>
              <input
                className="input"
                type="text"
                placeholder="PT. Maju Jaya Properti"
                {...register('company_name')}
              />
            </div>

            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                placeholder="nama@perusahaan.com"
                {...register('email', {
                  required: 'Email wajib diisi',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Format email tidak valid',
                  },
                })}
              />
              {errors.email && (
                <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                placeholder="Min. 8 karakter"
                {...register('password', {
                  required: 'Password wajib diisi',
                  minLength: { value: 8, message: 'Minimal 8 karakter' },
                })}
              />
              {errors.password && (
                <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              {isSubmitting ? 'Mendaftarkan...' : 'Buat Akun'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-500 mt-4">
          Sudah punya akun?{' '}
          <Link to="/login" className="text-brand-500 font-medium hover:underline">
            Masuk di sini
          </Link>
        </p>
      </div>
    </div>
  )
}
