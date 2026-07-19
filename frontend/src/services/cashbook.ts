import api from './api'
import type { AccountCategory, CashBookEntry, CashBookSummary, PaginatedResponse, CashDirection } from '../types'

export const cashbookService = {
  async listCategories(): Promise<AccountCategory[]> {
    const { data } = await api.get<AccountCategory[]>('/cashbook/categories')
    return data
  },
  async listEntries(params: {
    direction?: CashDirection; category_id?: string; date_from?: string; date_to?: string; page?: number; size?: number
  } = {}): Promise<PaginatedResponse<CashBookEntry>> {
    const { data } = await api.get<PaginatedResponse<CashBookEntry>>('/cashbook/entries', { params })
    return data
  },
  async summary(params: { date_from?: string; date_to?: string } = {}): Promise<CashBookSummary> {
    const { data } = await api.get<CashBookSummary>('/cashbook/summary', { params })
    return data
  },
}
