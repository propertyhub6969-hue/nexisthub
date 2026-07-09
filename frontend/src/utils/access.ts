import type { UserRole } from '../types'

// Peta akses menu per role (enforcement frontend; backend guard di api.py utk Konstruksi/Procurement).
// - produksi : Dashboard + area Produksi (Konstruksi/Procurement)
// - marketing: grup Marketing & Properti (+ Pemberkasan)
// - role lain (owner/admin/manager/viewer): akses penuh KECUALI area Produksi yg dibatasi PROD_ROLES
const ROLE_PATHS: Partial<Record<UserRole, string[]>> = {
  produksi: ['/dashboard', '/construction', '/procurement'],
  marketing: ['/marketing', '/property', '/pemberkasan'],
}

// Area Konstruksi & Procurement — hanya role ini (samakan dgn backend api.py PROD_ROLES).
const PROD_AREA = ['/construction', '/procurement']
const PROD_ROLES: UserRole[] = ['owner', 'admin', 'manager', 'produksi']

export function canAccessPath(role: UserRole | undefined, path: string, isPlatformAdmin = false): boolean {
  // Platform admin (vendor Control Plane) — HANYA area /platform, terlepas dari role tenant dummy-nya.
  if (isPlatformAdmin) return path.startsWith('/platform')
  if (!role) return true
  // Area Produksi dibatasi utk semua role (termasuk viewer) — hanya PROD_ROLES yang boleh.
  if (PROD_AREA.some((p) => path.startsWith(p))) return PROD_ROLES.includes(role)
  // Role dgn allow-list eksplisit (produksi/marketing) — selain area Produksi, ikuti daftarnya.
  const allowed = ROLE_PATHS[role]
  if (allowed) return allowed.some((p) => path.startsWith(p))
  return true // owner/admin/manager/viewer: penuh utk menu selain area Produksi
}

// Halaman default (landing/redirect) per role — harus berupa path yang boleh diakses role itu.
export function defaultPathFor(role: UserRole | undefined, isPlatformAdmin = false): string {
  if (isPlatformAdmin) return '/platform/tenants'
  if (role === 'marketing') return '/marketing/leads'
  return '/dashboard'
}

// ── Feature-flag (Control Plane) — modul on/off per tenant ─────────
// Peta path → modul. Yang lebih spesifik didahulukan. Path tanpa entri = core (selalu boleh).
const PATH_FEATURE: [string, string][] = [
  ['/marketing', 'marketing'],
  ['/pemberkasan', 'dokumen'],
  ['/property/legal-docs', 'dokumen'],
  ['/property', 'properti'],
  ['/construction', 'konstruksi'],
  ['/procurement', 'procurement'],
  ['/reports', 'laporan'],
]

export function featureForPath(path: string): string | null {
  const hit = PATH_FEATURE.find(([p]) => path.startsWith(p))
  return hit ? hit[1] : null
}

// flags null/undefined = semua modul aktif (tenant lama / super-admin).
export function canAccessFeature(flags: string[] | null | undefined, path: string): boolean {
  if (flags == null) return true
  const mod = featureForPath(path)
  if (!mod) return true
  return flags.includes(mod)
}
