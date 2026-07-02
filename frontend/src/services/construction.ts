import api from './api'
import type {
  ConstructionList, UnitConstructionRow, ConstructionUpsert,
  ContractorContract, ContractCreate, Opname, OpnameCreate,
} from '../types'

export const constructionService = {
  async list(projectId: string): Promise<ConstructionList> {
    const { data } = await api.get<ConstructionList>('/construction/', { params: { project_id: projectId } })
    return data
  },
  async upsert(unitId: string, payload: ConstructionUpsert): Promise<UnitConstructionRow> {
    const { data } = await api.put<UnitConstructionRow>(`/construction/unit/${unitId}`, payload)
    return data
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
}
