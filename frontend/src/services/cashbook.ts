import api from './api'
import type { AccountCategory, CashBookEntry, CashBookSummary, PaginatedResponse, CashDirection, PendingExpenseList } from '../types'

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
  async pendingExpenses(): Promise<PendingExpenseList> {
    const { data } = await api.get<PendingExpenseList>('/cashbook/pending-expenses')
    return data
  },
  async pendingExpensesCount(): Promise<number> {
    const { data } = await api.get<{ count: number }>('/cashbook/pending-expenses/count', { skipToast: true })
    return data.count
  },
  async markExpensesPaid(refs: string[], paid_date?: string): Promise<{ marked: number; paid_date: string }> {
    const { data } = await api.post('/cashbook/pending-expenses/mark-paid', { refs, paid_date: paid_date || null })
    return data
  },
}
