import api from './api'
import type { AuditEntry } from '../types'

export const auditService = {
  async list(params: { resource?: string; resource_id?: string; client_id?: string; limit?: number } = {}): Promise<AuditEntry[]> {
    const { data } = await api.get<AuditEntry[]>('/audit/', { params })
    return data
  },
}
