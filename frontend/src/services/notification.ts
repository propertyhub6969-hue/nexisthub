import api from './api'
import type { AppNotification } from '../types'

export const notificationService = {
  async list(onlyUnread = false, limit = 30): Promise<AppNotification[]> {
    const { data } = await api.get<AppNotification[]>('/notifications', {
      params: { only_unread: onlyUnread, limit },
    })
    return data
  },
  async unreadCount(): Promise<number> {
    const { data } = await api.get<{ count: number }>('/notifications/unread-count')
    return data.count
  },
  async markRead(id: string): Promise<void> {
    await api.post(`/notifications/${id}/read`, null, { skipToast: true })
  },
  async markAllRead(): Promise<void> {
    await api.post('/notifications/read-all', null, { skipToast: true })
  },
}
