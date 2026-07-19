// ── Auth ──────────────────────────────────────────────────────────
export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  password: string
  full_name: string
  phone: string
  company_name: string
  city: string
  project_count: number
  units_per_project: number
}

export interface Token {
  access_token: string
  refresh_token: string
  token_type: string
}

export type UserRole = 'owner' | 'admin' | 'manager' | 'produksi' | 'marketing' | 'finance' | 'viewer'

export interface UserResponse {
  id: string
  email: string
  full_name: string
  is_active: boolean
  role: UserRole
  additional_roles?: UserRole[] | null
  is_platform_admin?: boolean
  tenant_name?: string | null
  tenant_slug?: string | null
  tenant_status?: string | null
  feature_flags?: string[] | null  // null = semua modul aktif
}

// ── Control Plane / Platform ──────────────────────────────────────
export type TenantStatus = 'active' | 'suspended' | 'trial'
export interface TenantAdmin {
  id: string
  name: string
  slug: string
  status: TenantStatus
  is_active: boolean
  subscription_plan: string
  expires_at?: string | null
  feature_flags?: string[] | null
  user_count: number
  owner_email?: string | null
  owner_name?: string | null
  company_name?: string | null
  phone?: string | null
  city?: string | null
  province?: string | null
  estimated_project_count?: number | null
  estimated_units_per_project?: number | null
  is_deleted: boolean
  deleted_at?: string | null
  created_at: string
}
export interface TenantProvision {
  name: string
  slug?: string
  owner_full_name: string
  owner_email: string
  owner_password: string
  subscription_plan?: string
  status?: TenantStatus
  expires_at?: string | null
  feature_flags?: string[] | null
}
export interface TenantAdminUpdate {
  name?: string
  status?: TenantStatus
  is_active?: boolean
  subscription_plan?: string
  expires_at?: string | null
  feature_flags?: string[] | null
  owner_email?: string
  owner_name?: string
}

export type InvoiceStatus = 'unpaid' | 'paid' | 'void'
export interface Invoice {
  id: string
  tenant_id: string
  period_start: string
  period_end: string
  plan?: string
  amount: number
  status: InvoiceStatus
  method?: string
  paid_at?: string
  notes?: string
  created_at: string
}
export interface InvoiceCreate {
  period_start: string
  period_end: string
  plan?: string
  amount: number
  method?: string
  notes?: string
}
export interface RevenueTrendPoint {
  month: string
  amount: number
}
export interface RevenueSummary {
  total_paid: number
  paid_this_month: number
  outstanding: number
  mrr_estimate: number
  trend: RevenueTrendPoint[]
}
export interface Subscription {
  tenant_name: string
  slug: string
  plan: string
  status: string
  is_active: boolean
  expires_at?: string | null
  days_left?: number | null
}

// ── Team / Roles ──────────────────────────────────────────────────
export interface TeamMember {
  id: string
  email: string
  full_name: string
  phone?: string
  role: UserRole
  additional_roles?: UserRole[] | null
  is_active: boolean
}

export interface TeamMemberCreate {
  email: string
  full_name: string
  password: string
  phone?: string
  role: UserRole
  additional_roles?: UserRole[]
}

export interface TeamMemberUpdate {
  full_name?: string
  phone?: string
  role?: UserRole
  additional_roles?: UserRole[]
  is_active?: boolean
}

export interface TenantProfile {
  id: string
  name: string
  slug: string
  company_name?: string
  phone?: string
  address?: string
  city?: string
  province?: string
  has_logo: boolean
  logo_name?: string
}
export interface TenantProfileUpdate {
  company_name?: string
  phone?: string
  address?: string
  city?: string
  province?: string
}

// ── Marketing ─────────────────────────────────────────────────────
// NB: status values match backend enum values (lowercase).
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'unqualified'
export type LeadTemperature = 'cold' | 'warm' | 'hot'
export type ProspectStatus = 'active' | 'negotiation' | 'won' | 'lost'
export type ClientStatus = 'active' | 'completed' | 'inactive'
export type ClientPaymentType = 'cash' | 'kpr'

export interface Lead {
  id: string
  full_name: string
  phone?: string
  email?: string
  source?: string
  interest?: string
  interested_project_id?: string
  temperature?: LeadTemperature
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
  temperature?: LeadTemperature
  notes?: string
  status?: LeadStatus
}

export interface Prospect {
  id: string
  lead_id?: string
  full_name: string
  phone?: string
  email?: string
  interested_project_id?: string
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
  interested_project_id?: string
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
  payment_type?: ClientPaymentType
  promo?: string
  signature?: string
  ppjb_number?: string
  ajb_number?: string
  has_ppjb_file?: boolean
  has_ajb_file?: boolean
  notes?: string
  status: ClientStatus
  remaining?: number
  kpr_stage?: KprStage | null
  kpr_rejected?: boolean
  unit_label?: string   // "blok-nomor" dari relasi unit_id (dihitung backend)
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
  payment_type?: ClientPaymentType
  promo?: string
  signature?: string
  ppjb_number?: string
  ajb_number?: string
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
  has_siteplan?: boolean
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

export interface PriceItem {
  label: string
  amount: number
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
  price_breakdown?: PriceItem[]
  discount?: number
  position_x?: number
  position_y?: number
  notes?: string
  status: UnitStatus
  bast_number?: string
  bast_date?: string
  bast_user_name?: string
  buyer_name?: string
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
  price_breakdown?: PriceItem[]
  discount?: number
  notes?: string
  status?: UnitStatus
}

export interface UnitBulkGenerate {
  project_id: string
  block?: string
  start_number: number
  count: number
  pad?: number
  unit_type?: string
  land_area?: number
  building_area?: number
  price?: number
}

export interface UnitBulkResult {
  created: number
  skipped: number
  units: Unit[]
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
export type PaymentPurpose = 'dp' | 'booking_fee' | 'cicilan_termin' | 'realisasi_kpr' | 'pelunasan_termin' | 'lunas_unit' | 'cicilan' | 'pelunasan'
export type PaymentApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface PaymentSchedule {
  id: string
  client_id: string
  label: string
  sequence: number
  amount: number
  due_date?: string
  status: ScheduleStatus
  is_overdue: boolean
  paid: number
  remaining: number
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
  kpr_id?: string
  amount: number
  payment_date?: string
  method: PaymentMethod
  source: PaymentSource
  purpose?: PaymentPurpose
  receipt_number?: string
  has_file?: boolean
  file_name?: string
  notes?: string
  approval_status: PaymentApprovalStatus
  approver_id?: string
  approver_name?: string
  approved_at?: string
  rejection_reason?: string
  created_at: string
  updated_at: string
}

export interface PendingPayment extends Payment {
  client_name: string
  unit_label?: string
}

export interface Disbursement {
  id: string
  amount: number
  payment_date?: string
  notes?: string
  has_file?: boolean
  created_at: string
}

export interface PaymentCreate {
  client_id: string
  schedule_id?: string
  amount: number
  payment_date?: string
  method?: PaymentMethod
  source?: PaymentSource
  purpose?: PaymentPurpose
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
  from_buyer: number
  from_bank: number
  kpr_plafond: number
  buyer_remaining: number
  retention_remaining: number
  has_kpr: boolean
  pending_amount: number
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
  sk_number?: string
  ktp?: string
  phone?: string
  address?: string
  notes?: string
  created_at: string
  updated_at: string
}
export interface NotaryCreate {
  name: string
  sk_number?: string
  ktp?: string
  phone?: string
  address?: string
  notes?: string
}

export interface TaxRecord {
  id: string
  client_id: string
  tax_type: TaxType
  category?: SaleCategory
  base_amount?: number
  amount?: number
  id_billing?: string
  ntpn?: string
  tax_date?: string
  status: TaxStatus
  notary_id?: string
  notary_name?: string
  has_file?: boolean
  file_name?: string
  has_id_billing_file?: boolean
  id_billing_file_name?: string
  has_validation_file?: boolean
  validation_file_name?: string
  notes?: string
  created_at: string
  updated_at: string
}
export interface TaxCreate {
  client_id: string
  tax_type: TaxType
  category?: SaleCategory
  base_amount?: number
  amount?: number
  id_billing?: string
  ntpn?: string
  tax_date?: string
  status?: TaxStatus
  notary_id?: string
  notes?: string
}
export interface TaxBulkItem {
  tax_type: TaxType
  category?: SaleCategory
  base_amount?: number
  amount?: number
  id_billing?: string
  ntpn?: string
  tax_date?: string
  status?: TaxStatus
  notary_id?: string
  notes?: string
}
export interface TaxBulkCreate {
  client_id: string
  items: TaxBulkItem[]
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

// ── Serah-terima dokumen ASLI (fisik) ──
export type CustodyStatus = 'arsip' | 'diambil' | 'notaris' | 'pembeli' | 'bank'
export type HandoverEvent = 'ambil' | 'serah_notaris' | 'terima_pembeli' | 'tahan_bank' | 'kembali_arsip'
export interface DocumentHandover {
  id: string
  event: HandoverEvent
  at: string
  by_user_name?: string     // pencatat (akun sistem)
  notary_name?: string
  bank_name?: string
  client_name?: string
  received_by?: string      // PIC penerima yang ttd (mis. staf notaris)
  signature?: string        // ttd digital PIC penerima (data URL)
  notes?: string
  has_proof: boolean
  proof_name?: string
  created_at: string
}
export interface HandoverCreate {
  event: HandoverEvent
  at?: string
  notary_id?: string
  bank_id?: string
  client_id?: string
  received_by?: string
  signature?: string
  notes?: string
}
export interface UnitHandoverResult {
  affected: number
  doc_types: string[]
  has_proof: boolean
}

export interface DocumentItem {
  id: string
  client_id?: string
  unit_id?: string
  project_id?: string
  parent_document_id?: string
  doc_type: string
  name?: string
  address?: string
  status: DocStatus
  doc_date?: string
  expiry_date?: string
  land_area?: number
  file_name?: string
  file_type?: string
  file_size?: number
  has_file: boolean
  // penguasaan dokumen ASLI (fisik) — turunan kejadian serah-terima terakhir
  custody_status?: CustodyStatus
  custody_holder?: string
  custody_since?: string
  notes?: string
  created_at: string
  updated_at: string
}
export interface DocumentCreate {
  client_id?: string
  unit_id?: string
  project_id?: string
  parent_document_id?: string
  doc_type: string
  name?: string
  address?: string
  status?: DocStatus
  doc_date?: string
  expiry_date?: string
  land_area?: number
  notes?: string
}

// ── Legal: batch pemecahan sertifikat induk (BPN) ──────────────────
export type SplitBatchStatus = 'diajukan' | 'pengukuran' | 'sk_terbit' | 'selesai' | 'ditolak'

export interface SplitBatchItem {
  id: string
  unit_id: string
  unit_number?: string
  block?: string
  result_document_id?: string
  result_status?: DocStatus
}

export interface SplitBatch {
  id: string
  project_id: string
  master_document_id: string
  master_document_name?: string
  batch_number?: string
  status: SplitBatchStatus
  submitted_date?: string
  sk_number?: string
  sk_date?: string
  has_sk_file: boolean
  sk_file_name?: string
  notes?: string
  items: SplitBatchItem[]
  created_at: string
  updated_at: string
}

export interface SplitBatchCreate {
  master_document_id: string
  unit_ids: string[]
  submitted_date?: string
  notes?: string
}

export interface SplitBatchUpdate {
  status?: SplitBatchStatus
  submitted_date?: string
  sk_number?: string
  sk_date?: string
  notes?: string
}

// ── Riwayat tahapan proses dokumen (perizinan/sertifikat) ──────────
export type ProgressEvent = 'diajukan' | 'diproses' | 'revisi' | 'ditolak' | 'terbit'

export interface DocumentProgressLog {
  id: string
  event: ProgressEvent
  event_date: string
  institution?: string
  notes?: string
  by_user_name?: string
  created_at: string
}

export interface ProgressLogCreate {
  event: ProgressEvent
  event_date?: string
  institution?: string
  notes?: string
}
export interface DocumentBulkItem {
  doc_type: string
  name?: string
  address?: string
  status?: DocStatus
  doc_date?: string
  land_area?: number
}
export interface DocumentBulkCreate {
  unit_id?: string
  client_id?: string
  items: DocumentBulkItem[]
}

// ── KPR ───────────────────────────────────────────────────────────
export type KprStage = 'collect_berkas' | 'berkas_masuk_bank' | 'sp3k' | 'akad_kredit' | 'pencairan'

// ── Laporan: rejection-rate KPR per bank ──────────────────────────
export interface KprRejectionBank {
  bank_id: string | null
  bank_name: string
  total: number
  rejected: number
  approved: number
  in_process: number
  rejection_rate: number
  avg_days_to_akad?: number | null
  akad_samples: number
}

export interface KprRejectionReport {
  banks: KprRejectionBank[]
  total: number
  rejected: number
  approved: number
  in_process: number
  rejection_rate: number
  avg_days_to_akad?: number | null
  akad_samples: number
}

export interface SalesMonthly {
  month: string
  count: number
  value: number
}

export interface MonthlyTaxRow {
  client_id: string
  name: string
  nik?: string
  location?: string
  unit_number?: string
  category?: string
  base_amount?: number
  amount?: number
  ppn_amount?: number
  bphtb_amount?: number
  ntpn?: string
  shm_number?: string
  pbb_number?: string
  sikumbang_number?: string
  notary_name?: string
  tax_date?: string
}
export interface MonthlyTaxReport {
  month: string
  rows: MonthlyTaxRow[]
  total_count: number
  total_base_amount: number
  total_amount: number
  total_ppn_amount: number
  total_bphtb_amount: number
}

export type TaxChecklistStatus = 'belum_ada' | 'belum' | 'dibayar' | 'validasi' | 'dtp' | 'bebas'
export interface TaxChecklistItem {
  has_record: boolean
  status: TaxChecklistStatus
  is_complete: boolean
}
export interface TaxChecklistRow {
  client_id: string
  full_name: string
  unit_label?: string
  project_name?: string
  contract_date?: string
  days_since_contract?: number
  pph: TaxChecklistItem
  bphtb: TaxChecklistItem
  ppn: TaxChecklistItem
  incomplete_count: number
}
export interface TaxChecklistReport {
  rows: TaxChecklistRow[]
  total_clients: number
  total_incomplete_clients: number
}

export interface MonthlyTaxShareLink {
  id: string
  token: string
  month: string
  project_id?: string
  project_name?: string
  expires_at: string
  revoked_at?: string
  last_accessed_at?: string
  access_count: number
  is_active: boolean
  created_at: string
}
export interface ShareLinkCreate {
  month: string
  project_id?: string
  expires_days?: number
}

export interface CashflowMonth {
  month: string
  from_buyer: number
  from_bank: number
  total: number
}

export interface CashflowReport {
  total_contract: number
  from_buyer: number
  from_bank: number
  total_in: number
  kpr_plafond_total: number
  buyer_remaining: number
  retention_remaining: number
  months: CashflowMonth[]
}

export interface SalesProject {
  project_id: string
  project_name: string
  units_total: number
  units_available: number
  units_booked: number
  units_sold: number
  buyers: number
  contract_value: number
  cash_in: number
  remaining: number
}

export interface SalesRecapReport {
  projects: SalesProject[]
  units_total: number
  units_sold: number
  buyers: number
  contract_value: number
  cash_in: number
  remaining: number
}

export interface AgingClient {
  client_id: string
  full_name: string
  project_name?: string | null
  unit_label?: string | null
  overdue_count: number
  outstanding: number
  max_days: number
  bucket: string
}

export interface AgingReport {
  clients: AgingClient[]
  total_outstanding: number
  bucket_1_30: number
  bucket_31_60: number
  bucket_61_90: number
  bucket_90p: number
  overdue_clients: number
  overdue_schedules: number
}

export interface ConstructionProject {
  project_id: string
  project_name: string
  units_total: number
  avg_percent: number
  done: number
  in_progress: number
  not_started: number
  overdue_target: number
  late_update: number
}

export interface ConstructionProgressReport {
  projects: ConstructionProject[]
  units_total: number
  done: number
  overdue_target: number
  late_update: number
  avg_percent: number
  stage_counts: Record<string, number>
}

// ── Pemberkasan (ringkasan lintas pembeli, read-only) ──────────────
export interface FilingSummaryItem {
  client_id: string
  full_name: string
  project_name?: string
  unit_label?: string
  doc_total: number
  doc_terbit: number
  tax_total: number
  tax_settled: number
  kpr_stage?: KprStage
  bank_name?: string
  kpr_days?: number | null
  kpr_akad: boolean
}

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
  submitted_date?: string
  bank_submission_date?: string
  sp3k_date?: string
  akad_date?: string
  pencairan_date?: string
  pencairan_amount?: number
  pencairan_payment_id?: string
  total_disbursed?: number
  retention?: number
  rejected_date?: string
  rejection_reason?: string
  is_rejected?: boolean
  notes?: string
  pic_bank_name?: string
  pic_bank_signature?: string
  has_sp3k_file?: boolean
  sp3k_file_name?: string
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
  submitted_date?: string
  bank_submission_date?: string
  sp3k_date?: string
  akad_date?: string
  notes?: string
  pic_bank_name?: string
  pic_bank_signature?: string
}

// ── Tautan Bank & Kiriman menunggu persetujuan ─────────────────────
export type BankSubmissionStatus = 'pending' | 'accepted' | 'rejected'

export interface BankShareLink {
  id: string
  token: string
  bank_id: string
  bank_name_snapshot?: string
  expires_at: string
  revoked_at?: string
  last_accessed_at?: string
  access_count: number
  is_active: boolean
  created_at: string
}
export interface BankShareLinkCreate {
  bank_id: string
  expires_days: number
}

export interface BankSubmission {
  id: string
  kpr_application_id: string
  client_id: string
  client_name: string
  unit_label?: string
  bank_name?: string
  submitted_stage: KprStage
  submitted_sp3k_number?: string
  submitted_sp3k_date?: string
  submitted_plafond?: number
  submitted_tenor_months?: number
  submitted_notes?: string
  has_file: boolean
  file_name?: string
  status: BankSubmissionStatus
  reviewer_name?: string
  reviewed_at?: string
  notes?: string
  created_at: string
}

export interface PublicBankRow {
  kpr_application_id: string
  client_name: string
  unit_label?: string
  project_name?: string
  stage: KprStage
  plafond?: number
  tenor_months?: number
  doc_total: number
  doc_terbit: number
  tax_total: number
  tax_settled: number
  kpr_days?: number
}
export interface PublicBankPage {
  bank_name: string
  rows: PublicBankRow[]
}

// ── Tautan bagikan ke Notaris (PPJB/AJB, pajak, biaya notaris) ─────
export type NotarySubmissionKind = 'ppjb_ajb' | 'tax' | 'fee'
export type NotarySubmissionStatus = 'pending' | 'accepted' | 'rejected'

export interface NotaryShareLink {
  id: string
  token: string
  notary_id: string
  notary_name_snapshot?: string
  expires_at: string
  revoked_at?: string
  last_accessed_at?: string
  access_count: number
  is_active: boolean
  created_at: string
}
export interface NotaryShareLinkCreate {
  notary_id: string
  expires_days: number
}

export interface NotarySubmission {
  id: string
  client_id: string
  client_name: string
  unit_label?: string
  notary_name?: string
  kind: NotarySubmissionKind
  target_id?: string
  ppjb_number?: string
  has_ppjb_file: boolean
  ajb_number?: string
  has_ajb_file: boolean
  tax_type?: TaxType
  tax_category?: string
  tax_base_amount?: number
  tax_amount?: number
  tax_id_billing?: string
  tax_ntpn?: string
  tax_date?: string
  tax_status?: TaxStatus
  fee_description?: string
  fee_amount?: number
  fee_date?: string
  has_file: boolean
  file_name?: string
  submitted_notes?: string
  status: NotarySubmissionStatus
  reviewer_name?: string
  reviewed_at?: string
  review_notes?: string
  created_at: string
}

export interface PublicNotaryTaxRow {
  id: string
  tax_type: TaxType
  category: string
  amount?: number
  id_billing?: string
  ntpn?: string
  tax_date?: string
  status: TaxStatus
}
export interface PublicNotaryFeeRow {
  id: string
  description: string
  amount: number
  fee_date?: string
  is_paid: boolean
}
export interface PublicNotaryClientRow {
  client_id: string
  client_name: string
  unit_label?: string
  project_name?: string
  ppjb_number?: string
  has_ppjb_file: boolean
  ajb_number?: string
  has_ajb_file: boolean
  tax_records: PublicNotaryTaxRow[]
  fees: PublicNotaryFeeRow[]
}
export interface PublicNotaryPage {
  notary_name: string
  rows: PublicNotaryClientRow[]
}

// ── Procurement ───────────────────────────────────────────────────
export type VendorStatus = 'active' | 'inactive' | 'blacklisted'
export type POStatus = 'draft' | 'ordered' | 'partial' | 'received' | 'cancelled'
export type VendorPayMethod = 'transfer' | 'tunai' | 'lainnya'

export interface Material {
  id: string
  name: string
  unit?: string
  category?: string
  last_price?: number
  notes?: string
  created_at: string
  updated_at: string
}
export interface MaterialCreate {
  name: string
  unit?: string
  category?: string
  last_price?: number
  notes?: string
}

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
  received_qty: number
  outstanding: number
}

export interface ReceiveItem {
  po_item_id: string
  quantity: number
}
export interface ReceivePOPayload {
  do_number?: string
  receive_date?: string
  items: ReceiveItem[]
}
export interface PurchaseOrder {
  id: string
  vendor_id?: string
  vendor_name?: string
  project_id?: string
  warehouse_id?: string
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
  warehouse_id?: string
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

// ── Gudang (lokasi stok selain proyek) ────────────────────────────
export interface Warehouse {
  id: string
  name: string
  address?: string
  notes?: string
  created_at: string
}
export interface WarehouseCreate {
  name: string
  address?: string
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
export interface StockTransferCreate {
  from_project_id?: string
  from_warehouse_id?: string
  to_project_id?: string
  to_warehouse_id?: string
  material_name: string
  unit?: string
  quantity: number
  movement_date?: string
  notes?: string
}
export interface StockMovement {
  id: string
  project_id?: string
  warehouse_id?: string
  transfer_id?: string
  counterpart_label?: string
  material_name: string
  unit?: string
  movement_type: MovementType
  source: string
  quantity: number
  unit_price: number
  unit_id?: string
  po_id?: string
  po_item_id?: string
  do_number?: string
  received_by_id?: string
  received_by_name?: string
  movement_date?: string
  notes?: string
  created_at: string
}
export interface StockInCreate {
  project_id?: string
  warehouse_id?: string
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
export interface StockReturnVendorCreate {
  project_id?: string
  warehouse_id?: string
  material_name: string
  unit?: string
  quantity: number
  unit_price?: number
  po_id?: string
  po_item_id?: string
  movement_date?: string
  notes: string
}
export interface StockReturnUnitCreate {
  project_id: string
  material_name: string
  unit?: string
  quantity: number
  unit_id: string
  unit_price?: number
  movement_date?: string
  notes: string
}

// ── Biaya (Expense) & Rollup ──────────────────────────────────────
export type ExpenseCategory = 'material' | 'upah' | 'kontraktor' | 'kelistrikan' | 'operasional' | 'perizinan' | 'lain'

export interface Expense {
  id: string
  project_id: string
  unit_id?: string
  vendor_id?: string
  vendor_name?: string
  permit_log_id?: string
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
  permit_log_id?: string
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

// ── RAB & Kebocoran ───────────────────────────────────────────────
export interface RabLine { id?: string; category: ExpenseCategory; amount: number }
export interface RabTemplate { id: string; project_id: string; name: string; notes?: string; lines: RabLine[]; total: number; created_at: string; updated_at: string }
export interface RabTemplateCreate { project_id: string; name: string; notes?: string; lines: { category: ExpenseCategory; amount: number }[] }
export interface CatAmount { category: ExpenseCategory; amount: number }
export interface RabAdjustment { id: string; unit_id: string; category: ExpenseCategory; description?: string; amount: number }
export interface UnitRab { unit_id: string; rab_template_id?: string; template_name?: string; effective: CatAmount[]; effective_total: number; adjustments: RabAdjustment[] }
export interface LeakageRow { unit_id: string; unit_label: string; rab_total: number; realisasi_total: number; selisih: number }
export interface LeakageCat { category: ExpenseCategory; rab: number; realisasi: number; selisih: number }
export interface LeakageDetail { unit_id: string; unit_label: string; rows: LeakageCat[]; rab_total: number; realisasi_total: number; selisih: number }

// ── Konstruksi ────────────────────────────────────────────────────
export type ConstructionStage = 'persiapan' | 'pondasi' | 'struktur' | 'dinding' | 'atap' | 'finishing' | 'selesai'
export interface UnitConstructionRow {
  unit_id: string
  unit_label: string
  unit_type?: string
  stage: ConstructionStage
  percent: number
  start_date?: string
  target_date?: string
  finish_date?: string
  notes?: string
  last_log_date?: string | null
  kpr_stage?: KprStage | null
}
export interface ConstructionSummary {
  total_units: number
  avg_percent: number
  done_count: number
  stage_counts: Record<string, number>
  late_count: number
}
export interface ConstructionList {
  rows: UnitConstructionRow[]
  summary: ConstructionSummary
  total: number
  page: number
  size: number
  pages: number
}
export interface ConstructionUpsert {
  stage?: ConstructionStage
  percent?: number
  start_date?: string
  target_date?: string
  finish_date?: string
  notes?: string
}

// ── Kontraktor Borongan ───────────────────────────────────────────
export interface WorkItemBreakdown {
  id: string
  name: string
  value: number
  paid: number
  submitted: number
  remaining: number
}
export interface ContractorContract {
  id: string
  project_id: string
  unit_id: string
  unit_label: string
  vendor_id?: string
  vendor_name?: string
  pengawas?: string
  rab_category?: 'upah' | 'kontraktor'
  title?: string
  total_value: number
  paid: number
  submitted: number
  remaining: number
  items?: WorkItemBreakdown[]
  unassigned_paid?: number
  unassigned_submitted?: number
  notes?: string
  created_at: string
  updated_at: string
}
export interface WorkItemIn { name: string; value: number }
export interface ContractCreate {
  unit_id: string
  vendor_id?: string
  pengawas?: string
  rab_category?: 'upah' | 'kontraktor'
  title?: string
  total_value: number
  notes?: string
  items?: WorkItemIn[]
}
export interface Opname { id: string; amount: number; expense_date?: string; description: string; is_paid: boolean; paid_at?: string; work_item_id?: string; work_item_name?: string }
export interface OpnameCreate { amount: number; expense_date?: string; description?: string; work_item_id?: string }
export interface PendingOpname {
  id: string
  unit_id: string
  unit_label: string
  contractor_name?: string
  title?: string
  work_item_name?: string
  expense_date?: string
  description: string
  amount: number
}
export interface UpahResume {
  unit_id: string
  unit_label: string
  upah_minggu: number
  upah_dibayar: number
  upah_diajukan: number
  upah_total: number
  rab_tenaga_kerja: number
  selisih: number
  status: 'aman' | 'lewat'
  progress_percent: number
  progress_stage?: ConstructionStage
}
export interface StageTemplateLine { id: string; name: string; value: number }
export interface StageTemplate {
  id: string
  name: string
  mode: 'rp' | 'percent'
  lines: StageTemplateLine[]
  total: number
}
export interface StageTemplateCreate {
  name: string
  mode: 'rp' | 'percent'
  lines: { name: string; value: number }[]
}

// ── Log Progres Mingguan (riwayat berfoto) ──
export interface ProgressLog {
  id: string
  unit_id: string
  log_date: string
  stage?: ConstructionStage
  percent?: number
  notes?: string
  uploaded_by_name?: string
  has_photo: boolean
  created_at: string
}

// ── Audit ─────────────────────────────────────────────────────────
export interface AuditEntry {
  id: string
  action: string
  resource: string
  resource_id?: string
  old_data?: string
  new_data?: string
  reason?: string
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

// ── Buku Kas (Fase B1) ──────────────────────────────────────────────
export type CashDirection = 'in' | 'out'

export interface AccountCategory {
  id: string
  name: string
  direction: CashDirection
  code?: string
  notes?: string
  created_at: string
}

export interface CashBookEntry {
  id: string
  date: string
  direction: CashDirection
  amount: number
  category_id?: string
  category_name?: string
  source_type: string
  source_id: string
  description: string
  client_id?: string
  client_name?: string
  project_id?: string
  project_name?: string
  created_at: string
}

export interface CashBookCategoryTotal {
  category_id?: string
  category_name: string
  direction: CashDirection
  total: number
}

export interface CashBookMonth {
  month: string
  total_in: number
  total_out: number
}

export interface CashBookSummary {
  total_in: number
  total_out: number
  saldo: number
  by_category: CashBookCategoryTotal[]
  months: CashBookMonth[]
}
