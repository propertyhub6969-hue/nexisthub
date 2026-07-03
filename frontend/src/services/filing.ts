import api from './api'
import type { FilingSummaryItem } from '../types'

export const filingService = {
  async summary(): Promise<FilingSummaryItem[]> {
    const { data } = await api.get<FilingSummaryItem[]>('/filing/summary')
    return data
  },
}
