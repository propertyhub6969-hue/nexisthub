import api from './api'
import type {
  ConstructionList, UnitConstructionRow, ConstructionUpsert,
  ContractorContract, ContractCreate, Opname, OpnameCreate, ProgressLog, PendingOpname, UpahResume,
  StageTemplate, StageTemplateCreate,
} from '../types'

export const constructionService = {
  async list(projectId: string): Promise<ConstructionList> {
    const { data } = await api.get<ConstructionList>('/construction/', { params: { project_id: projectId } })
    return data
  },
  async getUpahResume(projectId: string): Promise<UpahResume[]> {
    const { data } = await api.get<UpahResume[]>('/construction/upah-resume', { params: { project_id: projectId } })
    return data
  },
  async upsert(unitId: string, payload: ConstructionUpsert): Promise<UnitConstructionRow> {
    const { data } = await api.put<UnitConstructionRow>(`/construction/unit/${unitId}`, payload)
    return data
  },

  // ── Log Progres Mingguan (riwayat berfoto) ──
  async listProgressLogs(unitId: string): Promise<ProgressLog[]> {
    const { data } = await api.get<ProgressLog[]>(`/construction/unit/${unitId}/logs`)
    return data
  },
  async addProgressLog(unitId: string, formData: FormData): Promise<ProgressLog> {
    const { data } = await api.post<ProgressLog>(`/construction/unit/${unitId}/logs`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  async deleteProgressLog(id: string): Promise<void> {
    await api.delete(`/construction/logs/${id}`)
  },
  async openProgressPhoto(logId: string): Promise<void> {
    const res = await api.get(`/construction/logs/${logId}/photo`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  },

  // ── Kontraktor Borongan ──
  async listContracts(projectId: string): Promise<ContractorContract[]> {
    const { data } = await api.get<ContractorContract[]>('/construction/contracts', { params: { project_id: projectId } })
    return data
  },
  async createContract(payload: ContractCreate): Promise<ContractorContract> {
    const { data } = await api.post<ContractorContract>('/construction/contracts', payload)
    return data
  },
  async updateContract(id: string, payload: Partial<ContractCreate>): Promise<ContractorContract> {
    const { data } = await api.patch<ContractorContract>(`/construction/contracts/${id}`, payload)
    return data
  },
  async deleteContract(id: string): Promise<void> {
    await api.delete(`/construction/contracts/${id}`)
  },
  async listOpname(contractId: string): Promise<Opname[]> {
    const { data } = await api.get<Opname[]>(`/construction/contracts/${contractId}/opname`)
    return data
  },
  async addOpname(contractId: string, payload: OpnameCreate): Promise<ContractorContract> {
    const { data } = await api.post<ContractorContract>(`/construction/contracts/${contractId}/opname`, payload)
    return data
  },
  async deleteOpname(id: string): Promise<void> {
    await api.delete(`/construction/opname/${id}`)
  },
  async getPendingOpname(projectId: string): Promise<PendingOpname[]> {
    const { data } = await api.get<PendingOpname[]>('/construction/opname/pending', { params: { project_id: projectId } })
    return data
  },
  async markOpnamePaid(ids: string[], paidDate?: string): Promise<{ marked: number; paid_date: string }> {
    const { data } = await api.post('/construction/opname/mark-paid', { ids, paid_date: paidDate || undefined })
    return data
  },
  // Template tahapan borongan (reusable, %+Rp)
  async listStageTemplates(): Promise<StageTemplate[]> {
    const { data } = await api.get<StageTemplate[]>('/construction/stage-templates')
    return data
  },
  async createStageTemplate(payload: StageTemplateCreate): Promise<StageTemplate> {
    const { data } = await api.post<StageTemplate>('/construction/stage-templates', payload)
    return data
  },
  async updateStageTemplate(id: string, payload: Partial<StageTemplateCreate>): Promise<StageTemplate> {
    const { data } = await api.patch<StageTemplate>(`/construction/stage-templates/${id}`, payload)
    return data
  },
  async deleteStageTemplate(id: string): Promise<void> {
    await api.delete(`/construction/stage-templates/${id}`)
  },
}
