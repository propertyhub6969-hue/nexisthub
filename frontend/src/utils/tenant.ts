// Deteksi slug tenant dari subdomain. Return null bila pintu umum/admin (app/www/localhost).
const GENERIC = new Set(['app', 'www', 'localhost'])

export function currentTenantSlug(): string | null {
  const host = window.location.hostname
  const m = host.match(/^([a-z0-9-]+)\.nexisthub\.id$/i)
  if (!m) return null
  const slug = m[1].toLowerCase()
  return GENERIC.has(slug) ? null : slug
}
