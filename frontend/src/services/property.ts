import api from './api'
import type {
  Project, ProjectCreate,
  Unit, UnitCreate, UnitBulkGenerate, UnitBulkResult,
  PaginatedResponse,
} from '../types'

interface ListParams {
  search?: string
  status?: string
  page?: number
  size?: number
}

interface UnitListParams extends ListParams {
  project_id?: string
}

export const propertyService = {
  // ── Projects ──
  async listProjects(params: ListParams = {}): Promise<PaginatedResponse<Project>> {
    const { data } = await api.get<PaginatedResponse<Project>>('/property/projects', { params })
    return data
  },
  async getProject(id: string): Promise<Project> {
    const { data } = await api.get<Project>(`/property/projects/${id}`)
    return data
  },
  async createProject(payload: ProjectCreate): Promise<Project> {
    const { data } = await api.post<Project>('/property/projects', payload)
    return data
  },
  async updateProject(id: string, payload: Partial<ProjectCreate>): Promise<Project> {
    const { data } = await api.patch<Project>(`/property/projects/${id}`, payload)
    return data
  },
  async deleteProject(id: string): Promise<void> {
    await api.delete(`/property/projects/${id}`)
  },

  // ── Units ──
  async listUnits(params: UnitListParams = {}): Promise<PaginatedResponse<Unit>> {
    const { data } = await api.get<PaginatedResponse<Unit>>('/property/units', { params })
    return data
  },
  async unitStats(projectId: string): Promise<{ total: number; by_status: Record<string, number> }> {
    const { data } = await api.get('/property/units/stats', { params: { project_id: projectId } })
    return data
  },
  async createUnit(payload: UnitCreate): Promise<Unit> {
    const { data } = await api.post<Unit>('/property/units', payload)
    return data
  },
  async bulkGenerateUnits(payload: UnitBulkGenerate): Promise<UnitBulkResult> {
    const { data } = await api.post<UnitBulkResult>('/property/units/bulk-generate', payload)
    return data
  },
  async updateUnit(id: string, payload: Partial<UnitCreate>): Promise<Unit> {
    const { data } = await api.patch<Unit>(`/property/units/${id}`, payload)
    return data
  },
  async deleteUnit(id: string): Promise<void> {
    await api.delete(`/property/units/${id}`)
  },
  async createBast(id: string, payload: { bast_date?: string; notes?: string }): Promise<Unit> {
    const { data } = await api.post<Unit>(`/property/units/${id}/bast`, payload)
    return data
  },

  // ── Siteplan ──
  async uploadSiteplan(projectId: string, file: File): Promise<Project> {
    const fd = new FormData()
    fd.append('file', file)
    const { data } = await api.post<Project>(`/property/projects/${projectId}/siteplan`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  async deleteSiteplan(projectId: string): Promise<Project> {
    const { data } = await api.delete<Project>(`/property/projects/${projectId}/siteplan`)
    return data
  },
  // Ambil gambar siteplan sebagai object URL (butuh auth Bearer → lewat axios, bukan <img src> langsung)
  async getSiteplanUrl(projectId: string): Promise<string | null> {
    try {
      const res = await api.get(`/property/projects/${projectId}/siteplan`, { responseType: 'blob' })
      return URL.createObjectURL(res.data as Blob)
    } catch {
      return null
    }
  },
  async saveUnitPositions(
    projectId: string,
    positions: { unit_id: string; position_x: number | null; position_y: number | null }[],
  ): Promise<Unit[]> {
    const { data } = await api.put<Unit[]>(`/property/projects/${projectId}/unit-positions`, positions)
    return data
  },
}
