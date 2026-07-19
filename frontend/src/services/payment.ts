import api from './api'
import type {
  PaymentSchedule, PaymentScheduleCreate,
  Payment, PaymentCreate, PaymentSummary, PendingPayment,
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
  async updateSchedule(id: string, payload: Partial<PaymentScheduleCreate> & { reason?: string }): Promise<PaymentSchedule> {
    const { data } = await api.patch<PaymentSchedule>(`/payments/schedules/${id}`, payload)
    return data
  },
  async deleteSchedule(id: string, reason: string): Promise<void> {
    await api.delete(`/payments/schedules/${id}`, { params: { reason } })
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
  async updatePayment(id: string, payload: Partial<PaymentCreate> & { reason?: string }): Promise<Payment> {
    const { data } = await api.patch<Payment>(`/payments/records/${id}`, payload)
    return data
  },
  async deletePayment(id: string, reason: string): Promise<void> {
    await api.delete(`/payments/records/${id}`, { params: { reason } })
  },
  async uploadPaymentFile(id: string, file: File): Promise<Payment> {
    const fd = new FormData()
    fd.append('file', file)
    const { data } = await api.post<Payment>(`/payments/records/${id}/file`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  async openPaymentFile(id: string): Promise<void> {
    const res = await api.get(`/payments/records/${id}/file`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  },

  // ── Persetujuan (Fase A) ──
  async listPending(): Promise<PendingPayment[]> {
    const { data } = await api.get<PendingPayment[]>('/payments/pending')
    return data
  },
  async approvePayment(id: string): Promise<Payment> {
    const { data } = await api.post<Payment>(`/payments/records/${id}/approve`)
    return data
  },
  async rejectPayment(id: string, reason: string): Promise<Payment> {
    const { data } = await api.post<Payment>(`/payments/records/${id}/reject`, { reason })
    return data
  },
}
