// ── Auth ──────────────────────────────────────────────────────────
export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  password: string
  full_name: string
  company_name?: string
}

export interface Token {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface UserResponse {
  id: string
  email: string
  full_name: string
  is_active: boolean
}

// ── Marketing ─────────────────────────────────────────────────────
// NB: status values match backend enum values (lowercase).
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'unqualified'
export type ProspectStatus = 'active' | 'negotiation' | 'won' | 'lost'
export type ClientStatus = 'active' | 'completed' | 'inactive'

export interface Lead {
  id: string
  full_name: string
  phone?: string
  email?: string
  source?: string
  interest?: string
  notes?: string
  status: LeadStatus
  assigned_to?: string
  created_at: string
  updated_at: string
}

export interface LeadCreate {
  full_name: string
  phone?: string
  email?: string
  source?: string
  interest?: string
  notes?: string
  status?: LeadStatus
}

export interface Prospect {
  id: string
  lead_id?: string
  full_name: string
  phone?: string
  email?: string
  unit_type?: string
  budget?: number
  notes?: string
  status: ProspectStatus
  created_at: string
  updated_at: string
}

export interface ProspectCreate {
  full_name: string
  phone?: string
  email?: string
  unit_type?: string
  budget?: number
  notes?: string
  status?: ProspectStatus
}

export interface Client {
  id: string
  prospect_id?: string
  full_name: string
  phone?: string
  email?: string
  nik?: string
  unit_number?: string
  unit_type?: string
  contract_value?: number
  contract_date?: string
  notes?: string
  status: ClientStatus
  created_at: string
  updated_at: string
}

export interface ClientCreate {
  full_name: string
  phone?: string
  email?: string
  nik?: string
  unit_number?: string
  unit_type?: string
  contract_value?: number
  contract_date?: string
  notes?: string
  status?: ClientStatus
}

// ── Pagination ────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}

// ── API Error ─────────────────────────────────────────────────────
export interface ApiError {
  detail: string
}
