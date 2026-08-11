import api from './api'
import type { ImportPreview, ImportCommitResult } from '../types'

export const importDataService = {
  // Unduh template UNIT (sudah terisi data unit tenant saat ini)
  async downloadUnitsTemplate(): Promise<void> {
    const res = await api.get('/import/units/template', { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'Template_Import_Unit.xlsx'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },

  async previewUnits(file: File): Promise<ImportPreview> {
    const fd = new FormData()
    fd.append('file', file)
    const { data } = await api.post<ImportPreview>('/import/units/preview', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  async commitUnits(file: File): Promise<ImportCommitResult> {
    const fd = new FormData()
    fd.append('file', file)
    const { data } = await api.post<ImportCommitResult>('/import/units/commit', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  // ── PEMBELI & KONTRAK ──
  async downloadClientsTemplate(): Promise<void> {
    const res = await api.get('/import/clients/template', { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'Template_Import_Pembeli.xlsx'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },

  async previewClients(file: File): Promise<ImportPreview> {
    const fd = new FormData()
    fd.append('file', file)
    const { data } = await api.post<ImportPreview>('/import/clients/preview', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  async commitClients(file: File): Promise<ImportCommitResult> {
    const fd = new FormData()
    fd.append('file', file)
    const { data } = await api.post<ImportCommitResult>('/import/clients/commit', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  // ── DOKUMEN LEGALITAS UNIT (manifest + ZIP opsional) ──
  async downloadDocumentsTemplate(): Promise<void> {
    const res = await api.get('/import/documents/template', { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'Template_Import_Dokumen.xlsx'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },

  async previewDocuments(manifest: File, archive?: File | null): Promise<ImportPreview> {
    const fd = new FormData()
    fd.append('manifest', manifest)
    if (archive) fd.append('archive', archive)
    const { data } = await api.post<ImportPreview>('/import/documents/preview', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  async commitDocuments(manifest: File, archive?: File | null): Promise<ImportCommitResult> {
    const fd = new FormData()
    fd.append('manifest', manifest)
    if (archive) fd.append('archive', archive)
    const { data } = await api.post<ImportCommitResult>('/import/documents/commit', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
}
