import api from './api'
import type {
  Bank, BankCreate, KprApplication, KprCreate, Disbursement,
  BankShareLink, BankShareLinkCreate, BankSubmission, PublicBankPage,
} from '../types'

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
  async reject(id: string, payload: { reason?: string; rejected_date?: string; cascade_release_unit: boolean }): Promise<KprApplication> {
    const { data } = await api.post<KprApplication>(`/kpr/applications/${id}/reject`, payload)
    return data
  },

  // ── Tautan bagikan ke Bank ──
  async listBankShareLinks(bankId?: string): Promise<BankShareLink[]> {
    const { data } = await api.get<BankShareLink[]>('/kpr/bank-share', { params: { bank_id: bankId || undefined } })
    return data
  },
  async createBankShareLink(payload: BankShareLinkCreate): Promise<BankShareLink> {
    const { data } = await api.post<BankShareLink>('/kpr/bank-share', payload)
    return data
  },
  async revokeBankShareLink(id: string): Promise<void> {
    await api.delete(`/kpr/bank-share/${id}`)
  },

  // ── Kiriman dari Bank (menunggu persetujuan) ──
  async listBankSubmissions(status: string = 'pending'): Promise<BankSubmission[]> {
    const { data } = await api.get<BankSubmission[]>('/kpr/bank-submissions', { params: { status } })
    return data
  },
  async bankSubmissionsPendingCount(): Promise<number> {
    const { data } = await api.get<{ count: number }>('/kpr/bank-submissions/pending-count')
    return data.count
  },
  async acceptBankSubmission(id: string): Promise<BankSubmission> {
    const { data } = await api.post<BankSubmission>(`/kpr/bank-submissions/${id}/accept`)
    return data
  },
  async rejectBankSubmission(id: string, reason: string): Promise<BankSubmission> {
    const { data } = await api.post<BankSubmission>(`/kpr/bank-submissions/${id}/reject`, { reason })
    return data
  },
  async openSubmissionFile(id: string): Promise<void> {
    const res = await api.get(`/kpr/bank-submissions/${id}/file`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  },
  async openSp3kFile(kprId: string): Promise<void> {
    const res = await api.get(`/kpr/applications/${kprId}/sp3k-file`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  },

  // ── Publik (tanpa login) — akses via tautan bank bertoken ──
  async publicBankPage(token: string): Promise<PublicBankPage> {
    const { data } = await api.get<PublicBankPage>(`/public/bank/${token}`)
    return data
  },
  async publicBankSubmit(token: string, payload: {
    kpr_application_id: string; stage: string; sp3k_number?: string; sp3k_date?: string; file?: File | null
  }): Promise<void> {
    const fd = new FormData()
    fd.append('kpr_application_id', payload.kpr_application_id)
    fd.append('stage', payload.stage)
    if (payload.sp3k_number) fd.append('sp3k_number', payload.sp3k_number)
    if (payload.sp3k_date) fd.append('sp3k_date', payload.sp3k_date)
    if (payload.file) fd.append('file', payload.file)
    await api.post(`/public/bank/${token}/submissions`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
}
