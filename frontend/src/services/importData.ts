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
}
