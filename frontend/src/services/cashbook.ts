import api from './api'
import type { AccountCategory, CashBookEntry, CashBookSummary, PaginatedResponse, CashDirection, PendingExpenseList, CashAccount, CashAccountsSummary, CashTransfer, ReconcileView, ReconciliationRow } from '../types'

export const cashbookService = {
  async listCategories(): Promise<AccountCategory[]> {
    const { data } = await api.get<AccountCategory[]>('/cashbook/categories')
    return data
  },
  async listEntries(params: {
    direction?: CashDirection; category_id?: string; account_id?: string; unassigned?: boolean; date_from?: string; date_to?: string; page?: number; size?: number
  } = {}): Promise<PaginatedResponse<CashBookEntry>> {
    const { data } = await api.get<PaginatedResponse<CashBookEntry>>('/cashbook/entries', { params })
    return data
  },

  // ── Rekening kas/bank ──
  async listAccounts(): Promise<CashAccountsSummary> {
    const { data } = await api.get<CashAccountsSummary>('/cashbook/accounts')
    return data
  },
  async createAccount(payload: Partial<CashAccount>): Promise<CashAccount> {
    const { data } = await api.post<CashAccount>('/cashbook/accounts', payload)
    return data
  },
  async updateAccount(id: string, payload: Partial<CashAccount>): Promise<CashAccount> {
    const { data } = await api.patch<CashAccount>(`/cashbook/accounts/${id}`, payload)
    return data
  },
  async setDefaultAccount(id: string): Promise<CashAccount> {
    const { data } = await api.post<CashAccount>(`/cashbook/accounts/${id}/set-default`)
    return data
  },
  async deleteAccount(id: string): Promise<void> {
    await api.delete(`/cashbook/accounts/${id}`)
  },
  async reassignEntryAccount(entryId: string, accountId: string | null): Promise<CashBookEntry> {
    const { data } = await api.patch<CashBookEntry>(`/cashbook/entries/${entryId}/account`, { account_id: accountId })
    return data
  },
  async listTransfers(): Promise<CashTransfer[]> {
    const { data } = await api.get<CashTransfer[]>('/cashbook/transfers')
    return data
  },
  async createTransfer(payload: { from_account_id: string; to_account_id: string; amount: number; date: string; notes?: string }): Promise<CashTransfer> {
    const { data } = await api.post<CashTransfer>('/cashbook/transfers', payload)
    return data
  },

  // ── Rekonsiliasi ──
  async reconcileView(accountId: string, asOf: string): Promise<ReconcileView> {
    const { data } = await api.get<ReconcileView>(`/cashbook/accounts/${accountId}/reconcile`, { params: { as_of: asOf } })
    return data
  },
  async setEntryCleared(entryId: string, is_cleared: boolean): Promise<void> {
    await api.patch(`/cashbook/entries/${entryId}/cleared`, { is_cleared })
  },
  async setTransferCleared(transferId: string, is_cleared: boolean): Promise<void> {
    await api.patch(`/cashbook/transfers/${transferId}/cleared`, { is_cleared })
  },
  async saveReconcile(accountId: string, payload: { statement_date: string; statement_balance: number; note?: string }): Promise<ReconciliationRow> {
    const { data } = await api.post<ReconciliationRow>(`/cashbook/accounts/${accountId}/reconcile`, payload)
    return data
  },
  async listReconciliations(accountId: string): Promise<ReconciliationRow[]> {
    const { data } = await api.get<ReconciliationRow[]>(`/cashbook/accounts/${accountId}/reconciliations`)
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
  async markExpensesPaid(refs: string[], paid_date?: string, account_id?: string): Promise<{ marked: number; paid_date: string }> {
    const { data } = await api.post('/cashbook/pending-expenses/mark-paid', { refs, paid_date: paid_date || null, account_id: account_id || null })
    return data
  },
}
