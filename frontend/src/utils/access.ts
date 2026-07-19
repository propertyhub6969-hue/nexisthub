import type { UserRole } from '../types'

// Peta akses menu per role (enforcement frontend; backend guard di api.py utk Konstruksi/Procurement).
// - produksi : Dashboard + area Produksi (Konstruksi/Procurement) + Report > Pembangunan saja
// - marketing: grup Marketing & Properti (+ Pemberkasan) + Report > Marketing saja
// - role lain (owner/admin/manager/viewer): akses penuh KECUALI area Produksi yg dibatasi PROD_ROLES
const ROLE_PATHS: Partial<Record<UserRole, string[]>> = {
  produksi: ['/dashboard', '/construction', '/procurement', '/reports/pembangunan'],
  marketing: ['/marketing', '/property', '/pemberkasan', '/reports/marketing'],
}

// Area Konstruksi & Procurement — hanya role ini (samakan dgn backend api.py PROD_ROLES).
const PROD_AREA = ['/construction', '/procurement']
const PROD_ROLES: UserRole[] = ['owner', 'admin', 'manager', 'produksi']

// ── Multi-role: user boleh punya peran utama (`role`) + peran tambahan opsional
// (`additional_roles`, mis. staf marketing yg juga pegang produksi). Akses = GABUNGAN
// (union) hak akses semua perannya, bukan cuma peran utama. Dua helper ini jadi satu
// pintu masuk supaya tak ada tempat lain yg lupa ikut peran tambahan. ──
type RoleBearer = { role?: UserRole; additional_roles?: UserRole[] | null } | null | undefined

export function effectiveRoles(user: RoleBearer): UserRole[] {
  if (!user?.role) return []
  return [user.role, ...(user.additional_roles ?? [])]
}

export function hasAnyRole(user: RoleBearer, roles: UserRole[]): boolean {
  return effectiveRoles(user).some((r) => roles.includes(r))
}

export function canAccessPath(roles: UserRole[] | undefined, path: string, isPlatformAdmin = false): boolean {
  // Platform admin (vendor Control Plane) — HANYA area /platform, terlepas dari role tenant dummy-nya.
  if (isPlatformAdmin) return path.startsWith('/platform')
  if (!roles || roles.length === 0) return true
  // Area Produksi dibatasi utk semua role (termasuk viewer) — hanya PROD_ROLES yang boleh (salah satu peran user cukup).
  if (PROD_AREA.some((p) => path.startsWith(p))) return roles.some((r) => PROD_ROLES.includes(r))
  // Kalau salah satu peran user TANPA allow-list eksplisit (owner/admin/manager/viewer) → akses penuh.
  if (roles.some((r) => !ROLE_PATHS[r])) return true
  // Semua peran user dibatasi (produksi/marketing dsb) → gabungan (union) allow-list semua perannya.
  return roles.some((r) => (ROLE_PATHS[r] ?? []).some((p) => path.startsWith(p)))
}

// Halaman default (landing/redirect) per role — harus berupa path yang boleh diakses gabungan peran itu.
export function defaultPathFor(roles: UserRole[] | undefined, isPlatformAdmin = false): string {
  if (isPlatformAdmin) return '/platform/tenants'
  if (roles && roles.length > 0 && !roles.some((r) => !ROLE_PATHS[r])) {
    // semua peran user dibatasi (tak ada yg akses penuh) — cari landing yg boleh diakses gabungan perannya
    if (canAccessPath(roles, '/dashboard')) return '/dashboard'
    if (roles.includes('marketing')) return '/marketing/leads'
  }
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
  ['/payments', 'pembayaran'],
  ['/cashbook', 'laporan'],
]

export function featureForPath(path: string): string | null {
  if (path.includes('/legal-splitting')) return 'dokumen'  // sub-halaman proyek, gerbang backend = feat("dokumen")
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
