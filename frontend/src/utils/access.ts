import type { UserRole } from '../types'

// Role 'produksi' hanya boleh akses Dashboard, Konstruksi, Procurement.
// Role lain: akses penuh (status quo — belum dibatasi).
export const PRODUKSI_PATHS = ['/dashboard', '/construction', '/procurement']

export function canAccessPath(role: UserRole | undefined, path: string): boolean {
  if (role === 'produksi') return PRODUKSI_PATHS.some((p) => path.startsWith(p))
  return true
}
