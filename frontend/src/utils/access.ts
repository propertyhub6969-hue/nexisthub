import type { UserRole } from '../types'

// Peta akses menu per role (enforcement frontend).
// - produksi : Dashboard, Konstruksi, Procurement
// - marketing: grup Marketing & Properti saja
// - role lain: akses penuh (status quo — belum dibatasi)
const ROLE_PATHS: Partial<Record<UserRole, string[]>> = {
  produksi: ['/dashboard', '/construction', '/procurement'],
  marketing: ['/marketing', '/property'],
}

export function canAccessPath(role: UserRole | undefined, path: string): boolean {
  if (!role) return true
  const allowed = ROLE_PATHS[role]
  if (!allowed) return true // role tak dibatasi
  return allowed.some((p) => path.startsWith(p))
}

// Halaman default (landing/redirect) per role — harus berupa path yang boleh diakses role itu.
export function defaultPathFor(role: UserRole | undefined): string {
  if (role === 'marketing') return '/marketing/leads'
  return '/dashboard'
}
