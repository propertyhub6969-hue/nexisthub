import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Building2, Loader2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import type { LoginPayload } from '../../types'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginPayload>()

  const onSubmit = async (data: LoginPayload) => {
    setError('')
    try {
      await login(data)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Login gagal. Coba lagi.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center">
            <Building2 size={20} className="text-white" />
          </div>
          <span className="text-xl font-bold text-slate-900 tracking-tight">
            NexistHub
          </span>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Masuk</h2>
          <p className="text-sm text-slate-500 mb-6">
            Selamat datang kembali di NexistHub
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                placeholder="nama@perusahaan.com"
                {...register('email', { required: 'Email wajib diisi' })}
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
                placeholder="••••••••"
                {...register('password', { required: 'Password wajib diisi' })}
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
              {isSubmitting ? 'Memproses...' : 'Masuk'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-500 mt-4">
          Belum punya akun?{' '}
          <Link to="/register" className="text-brand-500 font-medium hover:underline">
            Daftar sekarang
          </Link>
        </p>
      </div>
    </div>
  )
}
