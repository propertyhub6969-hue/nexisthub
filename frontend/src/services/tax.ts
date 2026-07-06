import api from './api'
import type {
  Notary, NotaryCreate, TaxRecord, TaxCreate, NotaryFee, NotaryFeeCreate,
} from '../types'

export const taxService = {
  // ── Notaris (master) ──
  async listNotaries(): Promise<Notary[]> {
    const { data } = await api.get<Notary[]>('/legal/notaries')
    return data
  },
  async createNotary(payload: NotaryCreate): Promise<Notary> {
    const { data } = await api.post<Notary>('/legal/notaries', payload)
    return data
  },
  async updateNotary(id: string, payload: Partial<NotaryCreate>): Promise<Notary> {
    const { data } = await api.patch<Notary>(`/legal/notaries/${id}`, payload)
    return data
  },
  async deleteNotary(id: string): Promise<void> {
    await api.delete(`/legal/notaries/${id}`)
  },

  // ── Pajak ──
  async listTax(clientId: string): Promise<TaxRecord[]> {
    const { data } = await api.get<TaxRecord[]>('/legal/tax-records', { params: { client_id: clientId } })
    return data
  },
  async createTax(payload: TaxCreate): Promise<TaxRecord> {
    const { data } = await api.post<TaxRecord>('/legal/tax-records', payload)
    return data
  },
  async updateTax(id: string, payload: Partial<TaxCreate>): Promise<TaxRecord> {
    const { data } = await api.patch<TaxRecord>(`/legal/tax-records/${id}`, payload)
    return data
  },
  async deleteTax(id: string): Promise<void> {
    await api.delete(`/legal/tax-records/${id}`)
  },
  async uploadTaxFile(id: string, file: File): Promise<TaxRecord> {
    const fd = new FormData()
    fd.append('file', file)
    const { data } = await api.post<TaxRecord>(`/legal/tax-records/${id}/file`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  async openTaxFile(id: string): Promise<void> {
    const res = await api.get(`/legal/tax-records/${id}/file`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  },
  async uploadIdBillingFile(id: string, file: File): Promise<TaxRecord> {
    const fd = new FormData()
    fd.append('file', file)
    const { data } = await api.post<TaxRecord>(`/legal/tax-records/${id}/id-billing-file`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  async openIdBillingFile(id: string): Promise<void> {
    const res = await api.get(`/legal/tax-records/${id}/id-billing-file`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  },
  async uploadValidationFile(id: string, file: File): Promise<TaxRecord> {
    const fd = new FormData()
    fd.append('file', file)
    const { data } = await api.post<TaxRecord>(`/legal/tax-records/${id}/validation-file`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  async openValidationFile(id: string): Promise<void> {
    const res = await api.get(`/legal/tax-records/${id}/validation-file`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  },

  // ── Biaya Notaris ──
  async listFees(clientId: string): Promise<NotaryFee[]> {
    const { data } = await api.get<NotaryFee[]>('/legal/notary-fees', { params: { client_id: clientId } })
    return data
  },
  async createFee(payload: NotaryFeeCreate): Promise<NotaryFee> {
    const { data } = await api.post<NotaryFee>('/legal/notary-fees', payload)
    return data
  },
  async updateFee(id: string, payload: Partial<NotaryFeeCreate>): Promise<NotaryFee> {
    const { data } = await api.patch<NotaryFee>(`/legal/notary-fees/${id}`, payload)
    return data
  },
  async deleteFee(id: string): Promise<void> {
    await api.delete(`/legal/notary-fees/${id}`)
  },
}
