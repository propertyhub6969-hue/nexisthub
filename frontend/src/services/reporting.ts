import api from './api'
import type { DashboardStats, KprRejectionReport, CashflowReport, SalesRecapReport, AgingReport, SalesMonthly, ConstructionProgressReport, MonthlyTaxReport, MonthlyTaxShareLink, ShareLinkCreate } from '../types'

export const reportingService = {
  async dashboard(): Promise<DashboardStats> {
    const { data } = await api.get<DashboardStats>('/reporting/dashboard')
    return data
  },

  async kprRejection(): Promise<KprRejectionReport> {
    const { data } = await api.get<KprRejectionReport>('/reporting/kpr-rejection')
    return data
  },

  async cashflow(): Promise<CashflowReport> {
    const { data } = await api.get<CashflowReport>('/reporting/cashflow')
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

  async salesMonthly(projectId?: string): Promise<SalesMonthly[]> {
    const { data } = await api.get<SalesMonthly[]>('/reporting/sales-monthly', {
      params: projectId ? { project_id: projectId } : {},
    })
    return data
  },

  async monthlyTax(month: string, projectId?: string): Promise<MonthlyTaxReport> {
    const { data } = await api.get<MonthlyTaxReport>('/reporting/monthly-tax', {
      params: { month, project_id: projectId || undefined },
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
