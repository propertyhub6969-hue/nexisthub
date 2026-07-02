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
  address?: string
  unit_number?: string
  unit_type?: string
  project_id?: string
  unit_id?: string
  marketing_user_id?: string
  marketing_name?: string
  contract_value?: number
  contract_date?: string
  promo?: string
  signature?: string
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
  address?: string
  project_id?: string
  unit_id?: string
  contract_value?: number
  contract_date?: string
  promo?: string
  signature?: string
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
  client_id: string
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
  client_id: string
  label: string
  sequence?: number
  amount: number
  due_date?: string
  status?: ScheduleStatus
  notes?: string
}

export interface Payment {
  id: string
  client_id: string
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
  client_id: string
  schedule_id?: string
  amount: number
  payment_date?: string
  method?: PaymentMethod
  source?: PaymentSource
  receipt_number?: string
  notes?: string
}

export interface PaymentSummary {
  client_id: string
  price: number
  total_paid: number
  remaining: number
  progress_percent: number
  schedule_count: number
  schedule_paid: number
  schedule_pending: number
  overdue_count: number
}

// ── Dashboard ─────────────────────────────────────────────────────
export interface DashboardStats {
  leads_total: number
  prospects_active: number
  clients_total: number
  units_total: number
  units_available: number
  units_booked: number
  units_sold: number
  payments_this_month: number
  total_contract: number
  total_paid: number
  outstanding: number
  overdue_count: number
}

// ── Perpajakan & Notaris ──────────────────────────────────────────
export type TaxType = 'pph' | 'bphtb' | 'ppn'
export type TaxStatus = 'belum' | 'dibayar' | 'validasi' | 'dtp' | 'bebas'

export interface Notary {
  id: string
  name: string
  office?: string
  phone?: string
  address?: string
  notes?: string
  created_at: string
  updated_at: string
}
export interface NotaryCreate {
  name: string
  office?: string
  phone?: string
  address?: string
  notes?: string
}

export interface TaxRecord {
  id: string
  client_id: string
  tax_type: TaxType
  amount?: number
  id_billing?: string
  ntpn?: string
  tax_date?: string
  status: TaxStatus
  notary_id?: string
  notary_name?: string
  notes?: string
  created_at: string
  updated_at: string
}
export interface TaxCreate {
  client_id: string
  tax_type: TaxType
  amount?: number
  id_billing?: string
  ntpn?: string
  tax_date?: string
  status?: TaxStatus
  notary_id?: string
  notes?: string
}

export interface NotaryFee {
  id: string
  client_id: string
  description: string
  amount: number
  fee_date?: string
  is_paid: boolean
  notary_id?: string
  notary_name?: string
  notes?: string
  created_at: string
  updated_at: string
}
export interface NotaryFeeCreate {
  client_id: string
  description: string
  amount: number
  fee_date?: string
  is_paid?: boolean
  notary_id?: string
  notes?: string
}

// ── Dokumen & Legalitas ───────────────────────────────────────────
export type DocStatus = 'belum' | 'proses' | 'terbit'

export interface DocumentItem {
  id: string
  client_id: string
  doc_type: string
  name?: string
  status: DocStatus
  doc_date?: string
  file_name?: string
  file_type?: string
  file_size?: number
  has_file: boolean
  notes?: string
  created_at: string
  updated_at: string
}
export interface DocumentCreate {
  client_id: string
  doc_type: string
  name?: string
  status?: DocStatus
  doc_date?: string
  notes?: string
}

// ── KPR ───────────────────────────────────────────────────────────
export type KprStage = 'collect_berkas' | 'berkas_masuk_bank' | 'sp3k' | 'akad_kredit' | 'pencairan'

export interface Bank {
  id: string
  name: string
  notes?: string
  created_at: string
  updated_at: string
}
export interface BankCreate { name: string; notes?: string }

export interface KprApplication {
  id: string
  client_id: string
  bank_id?: string
  bank_name?: string
  stage: KprStage
  plafond?: number
  tenor_months?: number
  interest_rate?: number
  sp3k_number?: string
  sikasep_number?: string
  submitted_date?: string
  sp3k_date?: string
  akad_date?: string
  pencairan_date?: string
  pencairan_amount?: number
  pencairan_payment_id?: string
  notes?: string
  created_at: string
  updated_at: string
}
export interface KprCreate {
  client_id: string
  bank_id?: string
  stage?: KprStage
  plafond?: number
  tenor_months?: number
  interest_rate?: number
  sp3k_number?: string
  sikasep_number?: string
  submitted_date?: string
  sp3k_date?: string
  akad_date?: string
  notes?: string
}

// ── Procurement ───────────────────────────────────────────────────
export type VendorStatus = 'active' | 'inactive' | 'blacklisted'
export type POStatus = 'draft' | 'ordered' | 'received' | 'cancelled'
export type VendorPayMethod = 'transfer' | 'tunai' | 'lainnya'

export interface Vendor {
  id: string
  name: string
  contact_name?: string
  phone?: string
  email?: string
  address?: string
  category?: string
  npwp?: string
  bank_name?: string
  bank_account?: string
  status: VendorStatus
  notes?: string
  created_at: string
  updated_at: string
}
export interface VendorCreate {
  name: string
  contact_name?: string
  phone?: string
  email?: string
  address?: string
  category?: string
  npwp?: string
  bank_name?: string
  bank_account?: string
  status?: VendorStatus
  notes?: string
}

export interface POItemIn {
  item_name: string
  unit?: string
  quantity: number
  unit_price: number
  notes?: string
}
export interface POItem extends POItemIn {
  id: string
  total_price: number
}
export interface PurchaseOrder {
  id: string
  vendor_id?: string
  vendor_name?: string
  project_id?: string
  unit_id?: string
  po_number?: string
  order_date?: string
  delivery_date?: string
  status: POStatus
  total_amount: number
  paid_amount: number
  remaining: number
  items: POItem[]
  notes?: string
  created_at: string
  updated_at: string
}
export interface POCreate {
  vendor_id?: string
  project_id?: string
  unit_id?: string
  po_number?: string
  order_date?: string
  delivery_date?: string
  status?: POStatus
  notes?: string
  items: POItemIn[]
}

export interface VendorPayment {
  id: string
  purchase_order_id: string
  amount: number
  payment_date?: string
  method: VendorPayMethod
  notes?: string
  created_at: string
  updated_at: string
}
export interface VendorPaymentCreate {
  purchase_order_id: string
  amount: number
  payment_date?: string
  method?: VendorPayMethod
  notes?: string
}

// ── Stok Material ─────────────────────────────────────────────────
export type MovementType = 'in' | 'out'

export interface StockBalance {
  material_name: string
  unit?: string
  qty_in: number
  qty_out: number
  balance: number
  avg_price: number
  value: number
}
export interface StockMovement {
  id: string
  project_id: string
  material_name: string
  unit?: string
  movement_type: MovementType
  source: string
  quantity: number
  unit_price: number
  unit_id?: string
  po_id?: string
  movement_date?: string
  notes?: string
  created_at: string
}
export interface StockInCreate {
  project_id: string
  material_name: string
  unit?: string
  quantity: number
  unit_price?: number
  movement_date?: string
  po_id?: string
  notes?: string
}
export interface StockOutCreate {
  project_id: string
  material_name: string
  unit?: string
  quantity: number
  unit_id?: string
  movement_date?: string
  notes?: string
}

// ── Biaya (Expense) & Rollup ──────────────────────────────────────
export type ExpenseCategory = 'material' | 'upah' | 'kontraktor' | 'operasional' | 'perizinan' | 'lain'

export interface Expense {
  id: string
  project_id: string
  unit_id?: string
  vendor_id?: string
  vendor_name?: string
  category: ExpenseCategory
  description: string
  amount: number
  expense_date?: string
  is_paid: boolean
  notes?: string
  created_at: string
  updated_at: string
}
export interface ExpenseCreate {
  project_id: string
  unit_id?: string
  vendor_id?: string
  category?: ExpenseCategory
  description: string
  amount: number
  expense_date?: string
  is_paid?: boolean
  notes?: string
}
export interface CostRow {
  unit_id?: string
  unit_label: string
  material_cost: number
  expense_cost: number
  total: number
}
export interface CostSummary {
  project_id: string
  rows: CostRow[]
  total_material: number
  total_expense: number
  grand_total: number
}

// ── Audit ─────────────────────────────────────────────────────────
export interface AuditEntry {
  id: string
  action: string
  resource: string
  resource_id?: string
  user_name?: string
  created_at: string
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
