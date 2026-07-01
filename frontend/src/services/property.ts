import api from './api'
import type {
  Project, ProjectCreate,
  Unit, UnitCreate,
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
  async createUnit(payload: UnitCreate): Promise<Unit> {
    const { data } = await api.post<Unit>('/property/units', payload)
    return data
  },
  async updateUnit(id: string, payload: Partial<UnitCreate>): Promise<Unit> {
    const { data } = await api.patch<Unit>(`/property/units/${id}`, payload)
    return data
  },
  async deleteUnit(id: string): Promise<void> {
    await api.delete(`/property/units/${id}`)
  },
}
