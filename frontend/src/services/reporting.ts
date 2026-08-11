import api from './api'
import type { DashboardStats, KprRejectionReport, CashflowReport, SalesRecapReport, AgingReport, SalesMonthly, ConstructionProgressReport, MonthlyTaxReport, MonthlyTaxShareLink, ShareLinkCreate, TaxChecklistReport, ProjectProfitReport, ProjectProfitDetail, KprSummaryReport, FinanceSummary, KprDetailRow, UnitDetailRow, BankRetentionReport, FinanceDetailRow } from '../types'

export const reportingService = {
  async dashboard(): Promise<DashboardStats> {
    const { data } = await api.get<DashboardStats>('/reporting/dashboard')
    return data
  },

  async kprRejection(): Promise<KprRejectionReport> {
    const { data } = await api.get<KprRejectionReport>('/reporting/kpr-rejection')
    return data
  },

  async cashflow(params?: { cat_from?: string; cat_to?: string }): Promise<CashflowReport> {
    const { data } = await api.get<CashflowReport>('/reporting/cashflow', { params })
    return data
  },

  async projectProfit(): Promise<ProjectProfitReport> {
    const { data } = await api.get<ProjectProfitReport>('/reporting/project-profit')
    return data
  },

  async projectProfitDetail(projectId: string): Promise<ProjectProfitDetail> {
    const { data } = await api.get<ProjectProfitDetail>(`/reporting/project-profit/${projectId}`)
    return data
  },

  async financeSummary(params: { project_id?: string; month?: string } = {}): Promise<FinanceSummary> {
    const { data } = await api.get<FinanceSummary>('/reporting/finance-summary', { params })
    return data
  },

  async unitsDetail(projectId?: string): Promise<UnitDetailRow[]> {
    const { data } = await api.get<UnitDetailRow[]>('/reporting/units-detail', { params: projectId ? { project_id: projectId } : {} })
    return data
  },

  async kprDetail(projectId?: string): Promise<KprDetailRow[]> {
    const { data } = await api.get<KprDetailRow[]>('/reporting/kpr-detail', { params: projectId ? { project_id: projectId } : {} })
    return data
  },

  async kprSummary(): Promise<KprSummaryReport> {
    const { data } = await api.get<KprSummaryReport>('/reporting/kpr-summary')
    return data
  },

  async bankRetention(): Promise<BankRetentionReport> {
    const { data } = await api.get<BankRetentionReport>('/reporting/bank-retention')
    return data
  },

  async financeDetail(kind: string, params: { project_id?: string; month?: string } = {}): Promise<FinanceDetailRow[]> {
    const { data } = await api.get<FinanceDetailRow[]>('/reporting/finance-detail', { params: { kind, ...params } })
    return data
  },

  async salesRecap(): Promise<SalesRecapReport> {
    const { data } = await api.get<SalesRecapReport>('/reporting/sales-recap')
    return data
  },

  async aging(): Promise<AgingReport> {
    const { data } = await api.get<AgingReport>('/reporting/aging')
    return data
  },

  async constructionProgress(): Promise<ConstructionProgressReport> {
    const { data } = await api.get<ConstructionProgressReport>('/reporting/construction-progress')
    return data
  },

  async salesMonthly(projectId?: string, year?: number): Promise<SalesMonthly[]> {
    const { data } = await api.get<SalesMonthly[]>('/reporting/sales-monthly', {
      params: { project_id: projectId || undefined, year: year || undefined },
    })
    // value datang sbg Decimal (string) dari backend — normalkan ke number di sini
    // supaya semua pemakai boleh percaya tipe SalesMonthly.value tanpa Number() berulang.
    return data.map((d) => ({ ...d, value: Number(d.value) }))
  },

  async monthlyTax(month: string, projectId?: string): Promise<MonthlyTaxReport> {
    const { data } = await api.get<MonthlyTaxReport>('/reporting/monthly-tax', {
      params: { month, project_id: projectId || undefined },
    })
    return data
  },

  async taxChecklist(projectId?: string, onlyIncomplete = true): Promise<TaxChecklistReport> {
    const { data } = await api.get<TaxChecklistReport>('/reporting/tax-checklist', {
      params: { project_id: projectId || undefined, only_incomplete: onlyIncomplete },
    })
    return data
  },

  async listShareLinks(): Promise<MonthlyTaxShareLink[]> {
    const { data } = await api.get<MonthlyTaxShareLink[]>('/reporting/monthly-tax/share')
    return data
  },
  async createShareLink(payload: ShareLinkCreate): Promise<MonthlyTaxShareLink> {
    const { data } = await api.post<MonthlyTaxShareLink>('/reporting/monthly-tax/share', payload)
    return data
  },
  async revokeShareLink(id: string): Promise<void> {
    await api.delete(`/reporting/monthly-tax/share/${id}`)
  },

  // ── Publik (tanpa login) — akses via tautan bertoken ──
  async publicMonthlyTax(token: string): Promise<MonthlyTaxReport> {
    const { data } = await api.get<MonthlyTaxReport>(`/public/monthly-tax/${token}`)
    return data
  },
}
