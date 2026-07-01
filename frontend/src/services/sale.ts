import api from './api'
import type { Sale, SaleCreate, PaginatedResponse } from '../types'

interface ListParams {
  search?: string
  status?: string
  category?: string
  project_id?: string
  page?: number
  size?: number
}

export const saleService = {
  async list(params: ListParams = {}): Promise<PaginatedResponse<Sale>> {
    const { data } = await api.get<PaginatedResponse<Sale>>('/sales/', { params })
    return data
  },
  async get(id: string): Promise<Sale> {
    const { data } = await api.get<Sale>(`/sales/${id}`)
    return data
  },
  async create(payload: SaleCreate): Promise<Sale> {
    const { data } = await api.post<Sale>('/sales/', payload)
    return data
  },
  async update(id: string, payload: Partial<SaleCreate>): Promise<Sale> {
    const { data } = await api.patch<Sale>(`/sales/${id}`, payload)
    return data
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/sales/${id}`)
  },
}
