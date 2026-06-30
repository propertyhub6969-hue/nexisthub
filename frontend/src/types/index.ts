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
export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'UNQUALIFIED'
export type ProspectStatus = 'ACTIVE' | 'NEGOTIATION' | 'WON' | 'LOST'
export type ClientStatus = 'ACTIVE' | 'COMPLETED' | 'INACTIVE'

export interface Lead {
  id: string
  full_name: string
  phone: string
  email?: string
  source?: string
  interest?: string
  notes?: string
  status: LeadStatus
  created_at: string
  updated_at: string
}

export interface Prospect {
  id: string
  lead_id: string
  unit_type?: string
  budget?: number
  status: ProspectStatus
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  prospect_id: string
  nik?: string
  unit_number?: string
  contract_value?: number
  contract_date?: string
  status: ClientStatus
  created_at: string
  updated_at: string
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
