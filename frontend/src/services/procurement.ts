import api from './api'
import type {
  Vendor, VendorCreate, PurchaseOrder, POCreate, VendorPayment, VendorPaymentCreate, PaginatedResponse,
  StockBalance, StockMovement, StockInCreate, StockOutCreate, StockReturnVendorCreate, StockReturnUnitCreate, ReceivePOPayload,
  Expense, ExpenseCreate, CostSummary, Material, MaterialCreate,
  RabTemplate, RabTemplateCreate, UnitRab, RabAdjustment, LeakageRow, LeakageDetail, ExpenseCategory,
} from '../types'

export const procurementService = {
  // ── Master Material ──
  async listMaterials(): Promise<Material[]> {
    const { data } = await api.get<Material[]>('/procurement/materials')
    return data
  },
  async createMaterial(payload: MaterialCreate): Promise<Material> {
    const { data } = await api.post<Material>('/procurement/materials', payload)
    return data
  },
  async updateMaterial(id: string, payload: Partial<MaterialCreate>): Promise<Material> {
    const { data } = await api.patch<Material>(`/procurement/materials/${id}`, payload)
    return data
  },
  async deleteMaterial(id: string): Promise<void> {
    await api.delete(`/procurement/materials/${id}`)
  },

  // ── Vendor ──
  async listVendors(search?: string, category?: string): Promise<Vendor[]> {
    const { data } = await api.get<PaginatedResponse<Vendor>>('/procurement/vendors', { params: { search, category, size: 500 } })
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
  async returnToVendor(payload: StockReturnVendorCreate): Promise<StockMovement> {
    const { data } = await api.post<StockMovement>('/procurement/stock/return-vendor', payload)
    return data
  },
  async returnFromUnit(payload: StockReturnUnitCreate): Promise<StockMovement> {
    const { data } = await api.post<StockMovement>('/procurement/stock/return-unit', payload)
    return data
  },
  async receivePO(poId: string, payload: ReceivePOPayload): Promise<StockMovement[]> {
    const { data } = await api.post<StockMovement[]>(`/procurement/stock/receive-po/${poId}`, payload)
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

  // ── RAB & Kebocoran ──
  async listTemplates(projectId: string): Promise<RabTemplate[]> {
    const { data } = await api.get<RabTemplate[]>('/procurement/rab-templates', { params: { project_id: projectId } })
    return data
  },
  async createTemplate(payload: RabTemplateCreate): Promise<RabTemplate> {
    const { data } = await api.post<RabTemplate>('/procurement/rab-templates', payload)
    return data
  },
  async updateTemplate(id: string, payload: Partial<RabTemplateCreate>): Promise<RabTemplate> {
    const { data } = await api.patch<RabTemplate>(`/procurement/rab-templates/${id}`, payload)
    return data
  },
  async deleteTemplate(id: string): Promise<void> {
    await api.delete(`/procurement/rab-templates/${id}`)
  },
  async getUnitRab(unitId: string): Promise<UnitRab> {
    const { data } = await api.get<UnitRab>(`/procurement/units/${unitId}/rab`)
    return data
  },
  async setUnitTemplate(unitId: string, rab_template_id: string | null): Promise<UnitRab> {
    const { data } = await api.patch<UnitRab>(`/procurement/units/${unitId}/rab`, { rab_template_id })
    return data
  },
  async addAdjustment(unitId: string, payload: { category: ExpenseCategory; description?: string; amount: number }): Promise<RabAdjustment> {
    const { data } = await api.post<RabAdjustment>(`/procurement/units/${unitId}/rab/adjustments`, payload)
    return data
  },
  async deleteAdjustment(id: string): Promise<void> {
    await api.delete(`/procurement/rab-adjustments/${id}`)
  },
  async leakage(projectId: string): Promise<LeakageRow[]> {
    const { data } = await api.get<LeakageRow[]>('/procurement/leakage', { params: { project_id: projectId } })
    return data
  },
  async leakageDetail(unitId: string): Promise<LeakageDetail> {
    const { data } = await api.get<LeakageDetail>(`/procurement/leakage/${unitId}`)
    return data
  },
}



