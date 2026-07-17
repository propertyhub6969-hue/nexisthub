import api from './api'
import type { DocumentItem, DocumentCreate, DocumentBulkCreate, DocumentHandover, HandoverCreate, UnitHandoverResult } from '../types'

export const documentService = {
  async bulkCreate(payload: DocumentBulkCreate): Promise<DocumentItem[]> {
    const { data } = await api.post<DocumentItem[]>('/legal/documents/bulk', payload)
    return data
  },
  async list(clientId: string): Promise<DocumentItem[]> {
    const { data } = await api.get<DocumentItem[]>('/legal/documents', { params: { client_id: clientId } })
    return data
  },
  async listByUnit(unitId: string): Promise<DocumentItem[]> {
    const { data } = await api.get<DocumentItem[]>('/legal/documents', { params: { unit_id: unitId } })
    return data
  },
  async create(payload: DocumentCreate): Promise<DocumentItem> {
    const { data } = await api.post<DocumentItem>('/legal/documents', payload)
    return data
  },
  async update(id: string, payload: Partial<DocumentCreate>): Promise<DocumentItem> {
    const { data } = await api.patch<DocumentItem>(`/legal/documents/${id}`, payload)
    return data
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/legal/documents/${id}`)
  },
  async uploadFile(id: string, file: File): Promise<DocumentItem> {
    const fd = new FormData()
    fd.append('file', file)
    const { data } = await api.post<DocumentItem>(`/legal/documents/${id}/file`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  async openFile(id: string): Promise<void> {
    const res = await api.get(`/legal/documents/${id}/file`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  },
  // ── Serah-terima dokumen ASLI (fisik) ──
  async listHandovers(docId: string): Promise<DocumentHandover[]> {
    const { data } = await api.get<DocumentHandover[]>(`/legal/documents/${docId}/handovers`)
    return data
  },
  async addHandover(docId: string, payload: HandoverCreate): Promise<DocumentHandover> {
    const { data } = await api.post<DocumentHandover>(`/legal/documents/${docId}/handovers`, payload)
    return data
  },
  // Serah-terima 1 PAKET: semua dokumen asli unit sekaligus, satu bukti bersama
  async addUnitHandover(unitId: string, payload: HandoverCreate, file?: File | null, docIds?: string[]): Promise<UnitHandoverResult> {
    const fd = new FormData()
    fd.append('event', payload.event)
    ;(docIds ?? []).forEach((id) => fd.append('doc_ids', id))   // kosong = semua dokumen unit
    if (payload.at) fd.append('at', payload.at)
    if (payload.notary_id) fd.append('notary_id', payload.notary_id)
    if (payload.bank_id) fd.append('bank_id', payload.bank_id)
    if (payload.client_id) fd.append('client_id', payload.client_id)
    if (payload.received_by) fd.append('received_by', payload.received_by)
    if (payload.signature) fd.append('signature', payload.signature)
    if (payload.notes) fd.append('notes', payload.notes)
    if (file) fd.append('file', file)
    const { data } = await api.post<UnitHandoverResult>(`/legal/units/${unitId}/handovers`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  async uploadProof(handoverId: string, file: File): Promise<DocumentHandover> {
    const fd = new FormData()
    fd.append('file', file)
    const { data } = await api.post<DocumentHandover>(`/legal/handovers/${handoverId}/proof`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  async openProof(handoverId: string): Promise<void> {
    const res = await api.get(`/legal/handovers/${handoverId}/proof`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  },
  async deleteHandover(handoverId: string): Promise<void> {
    await api.delete(`/legal/handovers/${handoverId}`)
  },
}
