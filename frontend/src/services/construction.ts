import api from './api'
import type { ConstructionList, UnitConstructionRow, ConstructionUpsert } from '../types'

export const constructionService = {
  async list(projectId: string): Promise<ConstructionList> {
    const { data } = await api.get<ConstructionList>('/construction/', { params: { project_id: projectId } })
    return data
  },
  async upsert(unitId: string, payload: ConstructionUpsert): Promise<UnitConstructionRow> {
    const { data } = await api.put<UnitConstructionRow>(`/construction/unit/${unitId}`, payload)
    return data
  },
}
