import api from './api'
import type {
  Vendor, VendorCreate, PurchaseOrder, POCreate, VendorPayment, VendorPaymentCreate, PaginatedResponse,
  StockBalance, StockMovement, StockInCreate, StockOutCreate,
  Expense, ExpenseCreate, CostSummary,
} from '../types'

export const procurementService = {
  // ── Vendor ──
  async listVendors(search?: string): Promise<Vendor[]> {
    const { data } = await api.get<PaginatedResponse<Vendor>>('/procurement/vendors', { params: { search, size: 500 } })
    return data.items
  },
  async createVendor(payload: VendorCreate): Promise<Vendor> {
    const { data } = await api.post<Vendor>('/procurement/vendors', payload)
    return data
  },
  async updateVendor(id: string, payload: Partial<VendorCreate>): Promise<Vendor> {
    const { data } = await api.patch<Vendor>(`/procurement/vendors/${id}`, payload)
    return data
  },
  async deleteVendor(id: string): Promise<void> {
    await api.delete(`/procurement/vendors/${id}`)
  },

  // ── Purchase Order ──
  async listPOs(params: { search?: string; project_id?: string; status?: string } = {}): Promise<PurchaseOrder[]> {
    const { data } = await api.get<PaginatedResponse<PurchaseOrder>>('/procurement/purchase-orders', { params: { ...params, size: 200 } })
    return data.items
  },
  async getPO(id: string): Promise<PurchaseOrder> {
    const { data } = await api.get<PurchaseOrder>(`/procurement/purchase-orders/${id}`)
    return data
  },
  async createPO(payload: POCreate): Promise<PurchaseOrder> {
    const { data } = await api.post<PurchaseOrder>('/procurement/purchase-orders', payload)
    return data
  },
  async updatePO(id: string, payload: Partial<POCreate>): Promise<PurchaseOrder> {
    const { data } = await api.patch<PurchaseOrder>(`/procurement/purchase-orders/${id}`, payload)
    return data
  },
  async deletePO(id: string): Promise<void> {
    await api.delete(`/procurement/purchase-orders/${id}`)
  },

  // ── Vendor Payment ──
  async listPayments(poId: string): Promise<VendorPayment[]> {
    const { data } = await api.get<VendorPayment[]>('/procurement/vendor-payments', { params: { purchase_order_id: poId } })
    return data
  },
  async createPayment(payload: VendorPaymentCreate): Promise<VendorPayment> {
    const { data } = await api.post<VendorPayment>('/procurement/vendor-payments', payload)
    return data
  },
  async deletePayment(id: string): Promise<void> {
    await api.delete(`/procurement/vendor-payments/${id}`)
  },

  // ── Stok Material ──
  async stockBalance(projectId: string): Promise<StockBalance[]> {
    const { data } = await api.get<StockBalance[]>('/procurement/stock', { params: { project_id: projectId } })
    return data
  },
  async stockMovements(projectId: string): Promise<StockMovement[]> {
    const { data } = await api.get<StockMovement[]>('/procurement/stock/movements', { params: { project_id: projectId } })
    return data
  },
  async stockIn(payload: StockInCreate): Promise<StockMovement> {
    const { data } = await api.post<StockMovement>('/procurement/stock/in', payload)
    return data
  },
  async stockOut(payload: StockOutCreate): Promise<StockMovement> {
    const { data } = await api.post<StockMovement>('/procurement/stock/out', payload)
    return data
  },
  async receivePO(poId: string): Promise<StockMovement[]> {
    const { data } = await api.post<StockMovement[]>(`/procurement/stock/receive-po/${poId}`)
    return data
  },
  async deleteMovement(id: string): Promise<void> {
    await api.delete(`/procurement/stock/movements/${id}`)
  },

  // ── Biaya (Expense) ──
  async listExpenses(projectId: string): Promise<Expense[]> {
    const { data } = await api.get<Expense[]>('/procurement/expenses', { params: { project_id: projectId } })
    return data
  },
  async createExpense(payload: ExpenseCreate): Promise<Expense> {
    const { data } = await api.post<Expense>('/procurement/expenses', payload)
    return data
  },
  async updateExpense(id: string, payload: Partial<ExpenseCreate>): Promise<Expense> {
    const { data } = await api.patch<Expense>(`/procurement/expenses/${id}`, payload)
    return data
  },
  async deleteExpense(id: string): Promise<void> {
    await api.delete(`/procurement/expenses/${id}`)
  },
  async costSummary(projectId: string): Promise<CostSummary> {
    const { data } = await api.get<CostSummary>('/procurement/cost-summary', { params: { project_id: projectId } })
    return data
  },
}


