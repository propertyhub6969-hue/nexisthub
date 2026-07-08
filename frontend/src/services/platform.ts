import api from './api'
import type { TenantAdmin, TenantProvision, TenantAdminUpdate, Invoice, InvoiceCreate } from '../types'

export const platformService = {
  async listInvoices(tenantId: string): Promise<Invoice[]> {
    const { data } = await api.get<Invoice[]>(`/platform/tenants/${tenantId}/invoices`)
    return data
  },
  async createInvoice(tenantId: string, payload: InvoiceCreate): Promise<Invoice> {
    const { data } = await api.post<Invoice>(`/platform/tenants/${tenantId}/invoices`, payload)
    return data
  },
  async markInvoicePaid(invoiceId: string, method?: string): Promise<Invoice> {
    const { data } = await api.post<Invoice>(`/platform/invoices/${invoiceId}/mark-paid`, { method })
    return data
  },
  async deleteInvoice(invoiceId: string): Promise<void> {
    await api.delete(`/platform/invoices/${invoiceId}`)
  },
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
