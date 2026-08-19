import api from './api'
import type { Subscription, Invoice } from '../types'

export const billingService = {
  async subscription(): Promise<Subscription> {
    const { data } = await api.get<Subscription>('/billing/subscription')
    return data
  },
  async invoices(): Promise<Invoice[]> {
    const { data } = await api.get<Invoice[]>('/billing/invoices')
    return data
  },
  async payLink(invoiceId: string): Promise<string> {
    const { data } = await api.post<{ payment_url: string }>(`/billing/invoices/${invoiceId}/pay-link`)
    return data.payment_url
  },
}
