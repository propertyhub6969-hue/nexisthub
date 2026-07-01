import api from './api'
import type {
  Lead, LeadCreate,
  Prospect, ProspectCreate,
  Client, ClientCreate,
  PaginatedResponse,
} from '../types'

interface ListParams {
  search?: string
  status?: string
  page?: number
  size?: number
}

export const marketingService = {
  // ── Leads ──
  async listLeads(params: ListParams = {}): Promise<PaginatedResponse<Lead>> {
    const { data } = await api.get<PaginatedResponse<Lead>>('/marketing/leads', { params })
    return data
  },
  async createLead(payload: LeadCreate): Promise<Lead> {
    const { data } = await api.post<Lead>('/marketing/leads', payload)
    return data
  },
  async updateLead(id: string, payload: Partial<LeadCreate>): Promise<Lead> {
    const { data } = await api.patch<Lead>(`/marketing/leads/${id}`, payload)
    return data
  },
  async deleteLead(id: string): Promise<void> {
    await api.delete(`/marketing/leads/${id}`)
  },

  // ── Prospects ──
  async listProspects(params: ListParams = {}): Promise<PaginatedResponse<Prospect>> {
    const { data } = await api.get<PaginatedResponse<Prospect>>('/marketing/prospects', { params })
    return data
  },
  async createProspect(payload: ProspectCreate): Promise<Prospect> {
    const { data } = await api.post<Prospect>('/marketing/prospects', payload)
    return data
  },
  async updateProspect(id: string, payload: Partial<ProspectCreate>): Promise<Prospect> {
    const { data } = await api.patch<Prospect>(`/marketing/prospects/${id}`, payload)
    return data
  },
  async deleteProspect(id: string): Promise<void> {
    await api.delete(`/marketing/prospects/${id}`)
  },

  // ── Clients ──
  async listClients(params: ListParams = {}): Promise<PaginatedResponse<Client>> {
    const { data } = await api.get<PaginatedResponse<Client>>('/marketing/clients', { params })
    return data
  },
  async createClient(payload: ClientCreate): Promise<Client> {
    const { data } = await api.post<Client>('/marketing/clients', payload)
    return data
  },
  async updateClient(id: string, payload: Partial<ClientCreate>): Promise<Client> {
    const { data } = await api.patch<Client>(`/marketing/clients/${id}`, payload)
    return data
  },
  async deleteClient(id: string): Promise<void> {
    await api.delete(`/marketing/clients/${id}`)
  },
}
