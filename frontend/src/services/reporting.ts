import api from './api'
import type { DashboardStats, KprRejectionReport, CashflowReport } from '../types'

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
}
