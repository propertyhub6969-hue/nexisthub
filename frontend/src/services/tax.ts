import api from './api'
import type {
  Notary, NotaryCreate, TaxRecord, TaxCreate, TaxBulkCreate, NotaryFee, NotaryFeeCreate, FeeBulkCreate,
  NotaryShareLink, NotaryShareLinkCreate, NotarySubmission, PublicNotaryPage,
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
  async bulkCreateTax(payload: TaxBulkCreate): Promise<TaxRecord[]> {
    const { data } = await api.post<TaxRecord[]>('/legal/tax-records/bulk', payload)
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
  async bulkCreateFees(payload: FeeBulkCreate): Promise<NotaryFee[]> {
    const { data } = await api.post<NotaryFee[]>('/legal/notary-fees/bulk', payload)
    return data
  },
  async updateFee(id: string, payload: Partial<NotaryFeeCreate>): Promise<NotaryFee> {
    const { data } = await api.patch<NotaryFee>(`/legal/notary-fees/${id}`, payload)
    return data
  },
  async deleteFee(id: string): Promise<void> {
    await api.delete(`/legal/notary-fees/${id}`)
  },

  // ── Tautan bagikan ke Notaris ──
  async listNotaryShareLinks(notaryId?: string): Promise<NotaryShareLink[]> {
    const { data } = await api.get<NotaryShareLink[]>('/legal/notary-share', { params: { notary_id: notaryId || undefined } })
    return data
  },
  async createNotaryShareLink(payload: NotaryShareLinkCreate): Promise<NotaryShareLink> {
    const { data } = await api.post<NotaryShareLink>('/legal/notary-share', payload)
    return data
  },
  async revokeNotaryShareLink(id: string): Promise<void> {
    await api.delete(`/legal/notary-share/${id}`)
  },

  // ── Kiriman dari Notaris (menunggu persetujuan) ──
  async listNotarySubmissions(status: string = 'pending'): Promise<NotarySubmission[]> {
    const { data } = await api.get<NotarySubmission[]>('/legal/notary-submissions', { params: { status } })
    return data
  },
  async notarySubmissionsPendingCount(): Promise<number> {
    const { data } = await api.get<{ count: number }>('/legal/notary-submissions/pending-count')
    return data.count
  },
  async acceptNotarySubmission(id: string): Promise<NotarySubmission> {
    const { data } = await api.post<NotarySubmission>(`/legal/notary-submissions/${id}/accept`)
    return data
  },
  async rejectNotarySubmission(id: string, reason: string): Promise<NotarySubmission> {
    const { data } = await api.post<NotarySubmission>(`/legal/notary-submissions/${id}/reject`, { reason })
    return data
  },
  async openSubmissionFile(id: string, kind: 'main' | 'ppjb' | 'ajb' = 'main'): Promise<void> {
    const res = await api.get(`/legal/notary-submissions/${id}/file`, { params: { kind }, responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  },

  // ── Publik (tanpa login) — akses via tautan notaris bertoken ──
  async publicNotaryPage(token: string): Promise<PublicNotaryPage> {
    const { data } = await api.get<PublicNotaryPage>(`/public/notary/${token}`)
    return data
  },
  async publicNotarySubmit(token: string, payload: {
    client_id: string; kind: 'ppjb_ajb' | 'tax' | 'fee' | 'custody'; target_id?: string
    ppjb_number?: string; ppjb_file?: File | null
    ajb_number?: string; ajb_file?: File | null
    tax_type?: string; tax_category?: string; tax_base_amount?: number; tax_amount?: number
    tax_id_billing?: string; tax_ntpn?: string; tax_date?: string; tax_status?: string
    fee_description?: string; fee_amount?: number; fee_date?: string
    custody_document_id?: string; custody_event?: string; custody_at?: string
    file?: File | null; notes?: string
  }): Promise<void> {
    const fd = new FormData()
    fd.append('client_id', payload.client_id)
    fd.append('kind', payload.kind)
    if (payload.target_id) fd.append('target_id', payload.target_id)
    if (payload.ppjb_number) fd.append('ppjb_number', payload.ppjb_number)
    if (payload.ppjb_file) fd.append('ppjb_file', payload.ppjb_file)
    if (payload.ajb_number) fd.append('ajb_number', payload.ajb_number)
    if (payload.ajb_file) fd.append('ajb_file', payload.ajb_file)
    if (payload.tax_type) fd.append('tax_type', payload.tax_type)
    if (payload.tax_category) fd.append('tax_category', payload.tax_category)
    if (payload.tax_base_amount != null) fd.append('tax_base_amount', String(payload.tax_base_amount))
    if (payload.tax_amount != null) fd.append('tax_amount', String(payload.tax_amount))
    if (payload.tax_id_billing) fd.append('tax_id_billing', payload.tax_id_billing)
    if (payload.tax_ntpn) fd.append('tax_ntpn', payload.tax_ntpn)
    if (payload.tax_date) fd.append('tax_date', payload.tax_date)
    if (payload.tax_status) fd.append('tax_status', payload.tax_status)
    if (payload.fee_description) fd.append('fee_description', payload.fee_description)
    if (payload.fee_amount != null) fd.append('fee_amount', String(payload.fee_amount))
    if (payload.fee_date) fd.append('fee_date', payload.fee_date)
    if (payload.custody_document_id) fd.append('custody_document_id', payload.custody_document_id)
    if (payload.custody_event) fd.append('custody_event', payload.custody_event)
    if (payload.custody_at) fd.append('custody_at', payload.custody_at)
    if (payload.file) fd.append('file', payload.file)
    if (payload.notes) fd.append('notes', payload.notes)
    await api.post(`/public/notary/${token}/submissions`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
}
