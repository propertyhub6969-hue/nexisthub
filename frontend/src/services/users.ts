import api from './api'
import type { TeamMember, TeamMemberCreate, TeamMemberUpdate, TenantProfile, TenantProfileUpdate } from '../types'

// URL publik logo tenant (tanpa auth) — dipakai langsung sbg <img src> di dokumen cetak.
// Absolut (bukan relatif) karena dipakai di jendela print yang dibuka via document.write (basis about:blank).
export function tenantLogoUrl(slug: string): string {
  return `${window.location.origin}/api/v1/public/tenant-logo/${slug}`
}

export const usersService = {
  async list(): Promise<TeamMember[]> {
    const { data } = await api.get<TeamMember[]>('/team/users')
    return data
  },

  async create(payload: TeamMemberCreate): Promise<TeamMember> {
    const { data } = await api.post<TeamMember>('/team/users', payload)
    return data
  },

  async update(id: string, payload: TeamMemberUpdate): Promise<TeamMember> {
    const { data } = await api.patch<TeamMember>(`/team/users/${id}`, payload)
    return data
  },

  async resetPassword(id: string, password: string): Promise<void> {
    await api.post(`/team/users/${id}/reset-password`, { password })
  },

  // ── Profil perusahaan (nama, alamat, logo) ──
  async getTenantProfile(): Promise<TenantProfile> {
    const { data } = await api.get<TenantProfile>('/team/tenant')
    return data
  },
  async updateTenantProfile(payload: TenantProfileUpdate): Promise<TenantProfile> {
    const { data } = await api.patch<TenantProfile>('/team/tenant', payload)
    return data
  },
  async uploadTenantLogo(file: File): Promise<TenantProfile> {
    const fd = new FormData()
    fd.append('file', file)
    const { data } = await api.post<TenantProfile>('/team/tenant/logo', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  async deleteTenantLogo(): Promise<TenantProfile> {
    const { data } = await api.delete<TenantProfile>('/team/tenant/logo')
    return data
  },
}
