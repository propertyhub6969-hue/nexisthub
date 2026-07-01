import api from './api'
import type {
  PaymentSchedule, PaymentScheduleCreate,
  Payment, PaymentCreate, PaymentSummary,
} from '../types'

export const paymentService = {
  async summary(clientId: string): Promise<PaymentSummary> {
    const { data } = await api.get<PaymentSummary>('/payments/summary', { params: { client_id: clientId } })
    return data
  },

  // ── Schedules (termin) ──
  async listSchedules(clientId: string): Promise<PaymentSchedule[]> {
    const { data } = await api.get<PaymentSchedule[]>('/payments/schedules', { params: { client_id: clientId } })
    return data
  },
  async createSchedule(payload: PaymentScheduleCreate): Promise<PaymentSchedule> {
    const { data } = await api.post<PaymentSchedule>('/payments/schedules', payload)
    return data
  },
  async updateSchedule(id: string, payload: Partial<PaymentScheduleCreate>): Promise<PaymentSchedule> {
    const { data } = await api.patch<PaymentSchedule>(`/payments/schedules/${id}`, payload)
    return data
  },
  async deleteSchedule(id: string): Promise<void> {
    await api.delete(`/payments/schedules/${id}`)
  },

  // ── Payments (uang masuk) ──
  async listPayments(clientId: string): Promise<Payment[]> {
    const { data } = await api.get<Payment[]>('/payments/records', { params: { client_id: clientId } })
    return data
  },
  async createPayment(payload: PaymentCreate): Promise<Payment> {
    const { data } = await api.post<Payment>('/payments/records', payload)
    return data
  },
  async updatePayment(id: string, payload: Partial<PaymentCreate>): Promise<Payment> {
    const { data } = await api.patch<Payment>(`/payments/records/${id}`, payload)
    return data
  },
  async deletePayment(id: string): Promise<void> {
    await api.delete(`/payments/records/${id}`)
  },
}
