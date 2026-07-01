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
  interested_project_id?: string
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
  interested_project_id?: string
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

// ── Property (Inventori) ──────────────────────────────────────────
export type ProjectStatus = 'planning' | 'selling' | 'sold_out' | 'inactive'
export type UnitStatus = 'available' | 'booked' | 'sold' | 'handover'

export interface Project {
  id: string
  name: string
  address?: string
  city?: string
  province?: string
  total_units?: number
  siteplan_image?: string
  description?: string
  status: ProjectStatus
  created_at: string
  updated_at: string
}

export interface ProjectCreate {
  name: string
  address?: string
  city?: string
  province?: string
  total_units?: number
  description?: string
  status?: ProjectStatus
}

export interface Unit {
  id: string
  project_id: string
  block?: string
  unit_number: string
  unit_type?: string
  land_area?: number
  building_area?: number
  price?: number
  position_x?: number
  position_y?: number
  notes?: string
  status: UnitStatus
  created_at: string
  updated_at: string
}

export interface UnitCreate {
  project_id: string
  block?: string
  unit_number: string
  unit_type?: string
  land_area?: number
  building_area?: number
  price?: number
  notes?: string
  status?: UnitStatus
}

// ── Sales (Penjualan) ─────────────────────────────────────────────
export type SaleCategory = 'subsidi' | 'komersial'
export type PaymentType = 'cash_keras' | 'cash_bertahap' | 'kpr'
export type SaleStatus = 'booking' | 'proses' | 'akad' | 'lunas' | 'batal'

export interface Sale {
  id: string
  unit_id?: string
  client_id?: string
  sale_number?: string
  category: SaleCategory
  payment_type: PaymentType
  price?: number
  booking_date?: string
  akad_date?: string
  status: SaleStatus
  notes?: string
  unit_label?: string
  project_id?: string
  client_name?: string
  created_at: string
  updated_at: string
}

export interface SaleCreate {
  unit_id: string
  client_id: string
  sale_number?: string
  category?: SaleCategory
  payment_type?: PaymentType
  price?: number
  booking_date?: string
  akad_date?: string
  status?: SaleStatus
  notes?: string
}

// ── Payments & Schedule (Pembayaran & Cicilan) ────────────────────
export type ScheduleStatus = 'pending' | 'paid'
export type PaymentMethod = 'transfer' | 'tunai' | 'lainnya'
export type PaymentSource = 'pembeli' | 'bank'

export interface PaymentSchedule {
  id: string
  sale_id: string
  label: string
  sequence: number
  amount: number
  due_date?: string
  status: ScheduleStatus
  is_overdue: boolean
  notes?: string
  created_at: string
  updated_at: string
}

export interface PaymentScheduleCreate {
  sale_id: string
  label: string
  sequence?: number
  amount: number
  due_date?: string
  status?: ScheduleStatus
  notes?: string
}

export interface Payment {
  id: string
  sale_id: string
  schedule_id?: string
  amount: number
  payment_date?: string
  method: PaymentMethod
  source: PaymentSource
  receipt_number?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface PaymentCreate {
  sale_id: string
  schedule_id?: string
  amount: number
  payment_date?: string
  method?: PaymentMethod
  source?: PaymentSource
  receipt_number?: string
  notes?: string
}

export interface PaymentSummary {
  sale_id: string
  price: number
  total_paid: number
  remaining: number
  progress_percent: number
  schedule_count: number
  schedule_paid: number
  schedule_pending: number
  overdue_count: number
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
