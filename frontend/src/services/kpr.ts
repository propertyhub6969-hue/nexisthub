import api from './api'
import type { Bank, BankCreate, KprApplication, KprCreate, Disbursement } from '../types'

export const kprService = {
  // ── Bank (master) ──
  async listBanks(): Promise<Bank[]> {
    const { data } = await api.get<Bank[]>('/kpr/banks')
    return data
  },
  async createBank(payload: BankCreate): Promise<Bank> {
    const { data } = await api.post<Bank>('/kpr/banks', payload)
    return data
  },
  async updateBank(id: string, payload: Partial<BankCreate>): Promise<Bank> {
    const { data } = await api.patch<Bank>(`/kpr/banks/${id}`, payload)
    return data
  },
  async deleteBank(id: string): Promise<void> {
    await api.delete(`/kpr/banks/${id}`)
  },

  // ── Pengajuan KPR ──
  async listApplications(clientId: string): Promise<KprApplication[]> {
    const { data } = await api.get<KprApplication[]>('/kpr/applications', { params: { client_id: clientId } })
    return data
  },
  async createApplication(payload: KprCreate): Promise<KprApplication> {
    const { data } = await api.post<KprApplication>('/kpr/applications', payload)
    return data
  },
  async updateApplication(id: string, payload: Partial<KprCreate>): Promise<KprApplication> {
    const { data } = await api.patch<KprApplication>(`/kpr/applications/${id}`, payload)
    return data
  },
  async deleteApplication(id: string): Promise<void> {
    await api.delete(`/kpr/applications/${id}`)
  },
  async disburse(id: string, amount: number, pay_date?: string, notes?: string): Promise<KprApplication> {
    const { data } = await api.post<KprApplication>(`/kpr/applications/${id}/disburse`, { amount, pay_date, notes })
    return data
  },
  async listDisbursements(id: string): Promise<Disbursement[]> {
    const { data } = await api.get<Disbursement[]>(`/kpr/applications/${id}/disbursements`)
    return data
  },
  async deleteDisbursement(paymentId: string): Promise<void> {
    await api.delete(`/kpr/disbursements/${paymentId}`)
  },
}
