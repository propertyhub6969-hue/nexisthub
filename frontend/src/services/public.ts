import api from './api'

export interface PublicTenant { name: string; slug: string }

export const publicService = {
  async tenantBySlug(slug: string): Promise<PublicTenant | null> {
    try {
      const { data } = await api.get<PublicTenant>(`/public/tenant/${slug}`)
      return data
    } catch {
      return null
    }
  },
}
