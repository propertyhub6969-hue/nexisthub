import api from './api'
import type {
  Project, ProjectCreate,
  Unit, UnitCreate, UnitBulkGenerate, UnitBulkResult,
  PaginatedResponse,
  SiteplanShareLink, SiteplanShareLinkCreate, BookingRequest, PublicSiteplanPage,
  UnitUtility, UtilityUpsert, UtilitySummary,
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

  // ── Tautan Siteplan (agen) ──
  async listSiteplanShareLinks(projectId?: string): Promise<SiteplanShareLink[]> {
    const { data } = await api.get<SiteplanShareLink[]>('/property/siteplan-share', { params: { project_id: projectId } })
    return data
  },
  async createSiteplanShareLink(payload: SiteplanShareLinkCreate): Promise<SiteplanShareLink> {
    const { data } = await api.post<SiteplanShareLink>('/property/siteplan-share', payload)
    return data
  },
  async revokeSiteplanShareLink(id: string): Promise<void> {
    await api.delete(`/property/siteplan-share/${id}`)
  },

  // ── Permintaan booking dari agen ──
  async listBookingRequests(status = 'pending'): Promise<BookingRequest[]> {
    const { data } = await api.get<BookingRequest[]>('/property/booking-requests', { params: { status } })
    return data
  },
  async bookingRequestsPendingCount(): Promise<number> {
    const { data } = await api.get<{ count: number }>('/property/booking-requests/pending-count')
    return data.count
  },
  async acceptBookingRequest(id: string): Promise<BookingRequest> {
    const { data } = await api.post<BookingRequest>(`/property/booking-requests/${id}/accept`)
    return data
  },
  async cancelBookingRequest(id: string, reason: string): Promise<BookingRequest> {
    const { data } = await api.post<BookingRequest>(`/property/booking-requests/${id}/cancel`, { reason })
    return data
  },
  async rejectBookingRequest(id: string, reason: string): Promise<BookingRequest> {
    const { data } = await api.post<BookingRequest>(`/property/booking-requests/${id}/reject`, { reason })
    return data
  },

  // ── Publik (tanpa login) — tautan siteplan agen ──
  async publicSiteplan(token: string): Promise<PublicSiteplanPage> {
    const { data } = await api.get<PublicSiteplanPage>(`/public/siteplan/${token}`)
    return data
  },
  async publicSiteplanBooking(token: string, payload: {
    unit_id: string; agent_name: string; agent_phone?: string
    prospect_name?: string; prospect_phone?: string; notes?: string
  }): Promise<void> {
    const fd = new FormData()
    Object.entries(payload).forEach(([k, v]) => { if (v) fd.append(k, v) })
    await api.post(`/public/siteplan/${token}/booking`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },

  // ── Utilitas unit (PLN/PDAM) ──
  async listUnitUtilities(unitId: string): Promise<UnitUtility[]> {
    const { data } = await api.get<UnitUtility[]>(`/property/units/${unitId}/utilities`)
    return data
  },
  async saveUnitUtility(unitId: string, payload: UtilityUpsert): Promise<UnitUtility> {
    const { data } = await api.put<UnitUtility>(`/property/units/${unitId}/utilities`, payload)
    return data
  },
  async utilitiesSummary(projectId: string, onlyIncomplete = false): Promise<UtilitySummary> {
    const { data } = await api.get<UtilitySummary>('/property/utilities/summary', {
      params: { project_id: projectId, only_incomplete: onlyIncomplete },
    })
    return data
  },
}
