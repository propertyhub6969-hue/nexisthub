import api from './api'
import type { TenantAdmin, TenantProvision, TenantAdminUpdate } from '../types'

export const platformService = {
  async listModules(): Promise<string[]> {
    const { data } = await api.get<string[]>('/platform/modules')
    return data
  },
  async listTenants(): Promise<TenantAdmin[]> {
    const { data } = await api.get<TenantAdmin[]>('/platform/tenants')
    return data
  },
  async createTenant(payload: TenantProvision): Promise<TenantAdmin> {
    const { data } = await api.post<TenantAdmin>('/platform/tenants', payload)
    return data
  },
  async updateTenant(id: string, payload: TenantAdminUpdate): Promise<TenantAdmin> {
    const { data } = await api.patch<TenantAdmin>(`/platform/tenants/${id}`, payload)
    return data
  },
  async resetOwnerPassword(id: string, newPassword: string): Promise<void> {
    await api.post(`/platform/tenants/${id}/reset-owner-password`, { new_password: newPassword })
  },
}
