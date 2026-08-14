import api from './api'
import type { AnnouncementPublic, AnnouncementAdmin, AnnouncementCreate } from '../types'

export const announcementService = {
  // ── Pengguna tenant (popup) ──
  async active(): Promise<AnnouncementPublic[]> {
    const { data } = await api.get<AnnouncementPublic[]>('/announcements/active', { skipToast: true })
    return data
  },
  async dismiss(id: string): Promise<void> {
    await api.post(`/announcements/${id}/dismiss`, undefined, { skipToast: true })
  },

  // ── Super-admin (control plane) ──
  async list(): Promise<AnnouncementAdmin[]> {
    const { data } = await api.get<AnnouncementAdmin[]>('/platform/announcements')
    return data
  },
  async create(payload: AnnouncementCreate): Promise<AnnouncementAdmin> {
    const { data } = await api.post<AnnouncementAdmin>('/platform/announcements', payload)
    return data
  },
  async update(id: string, payload: Partial<AnnouncementCreate>): Promise<AnnouncementAdmin> {
    const { data } = await api.patch<AnnouncementAdmin>(`/platform/announcements/${id}`, payload)
    return data
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/platform/announcements/${id}`)
  },
}
