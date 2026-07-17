import api from './api'
import type {
  DocumentItem, DocumentCreate, DocumentBulkCreate, DocumentHandover, HandoverCreate, UnitHandoverResult,
  SplitBatch, SplitBatchCreate, SplitBatchUpdate,
  DocumentProgressLog, ProgressLogCreate,
} from '../types'

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
  async listByProject(projectId: string): Promise<DocumentItem[]> {
    const { data } = await api.get<DocumentItem[]>('/legal/documents', { params: { project_id: projectId } })
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

  // ── Riwayat tahapan proses dokumen (perizinan/sertifikat) ──
  async listProgress(docId: string): Promise<DocumentProgressLog[]> {
    const { data } = await api.get<DocumentProgressLog[]>(`/legal/documents/${docId}/progress`)
    return data
  },
  async addProgress(docId: string, payload: ProgressLogCreate): Promise<DocumentProgressLog> {
    const { data } = await api.post<DocumentProgressLog>(`/legal/documents/${docId}/progress`, payload)
    return data
  },
  async deleteProgress(logId: string): Promise<void> {
    await api.delete(`/legal/progress/${logId}`)
  },

  // ── Batch pemecahan sertifikat induk (BPN) ──
  async listSplitBatches(projectId: string): Promise<SplitBatch[]> {
    const { data } = await api.get<SplitBatch[]>(`/legal/projects/${projectId}/split-batches`)
    return data
  },
  async createSplitBatch(payload: SplitBatchCreate): Promise<SplitBatch> {
    const { data } = await api.post<SplitBatch>('/legal/split-batches', payload)
    return data
  },
  async updateSplitBatch(batchId: string, payload: SplitBatchUpdate): Promise<SplitBatch> {
    const { data } = await api.patch<SplitBatch>(`/legal/split-batches/${batchId}`, payload)
    return data
  },
  async addSplitBatchUnits(batchId: string, unitIds: string[]): Promise<SplitBatch> {
    const { data } = await api.post<SplitBatch>(`/legal/split-batches/${batchId}/units`, { unit_ids: unitIds })
    return data
  },
  async removeSplitBatchItem(batchId: string, itemId: string): Promise<void> {
    await api.delete(`/legal/split-batches/${batchId}/items/${itemId}`)
  },
  async linkSplitBatchResult(batchId: string, itemId: string, resultDocumentId: string): Promise<SplitBatch> {
    const { data } = await api.patch<SplitBatch>(
      `/legal/split-batches/${batchId}/items/${itemId}`, { result_document_id: resultDocumentId }
    )
    return data
  },
  async uploadSplitBatchSkFile(batchId: string, file: File): Promise<SplitBatch> {
    const fd = new FormData()
    fd.append('file', file)
    const { data } = await api.post<SplitBatch>(`/legal/split-batches/${batchId}/sk-file`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  async openSplitBatchSkFile(batchId: string): Promise<void> {
    const res = await api.get(`/legal/split-batches/${batchId}/sk-file`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  },
  async deleteSplitBatch(batchId: string): Promise<void> {
    await api.delete(`/legal/split-batches/${batchId}`)
  },
}
