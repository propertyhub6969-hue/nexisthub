import api from './api'
import type { DocumentItem, DocumentCreate } from '../types'

export const documentService = {
  async list(clientId: string): Promise<DocumentItem[]> {
    const { data } = await api.get<DocumentItem[]>('/legal/documents', { params: { client_id: clientId } })
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
}
