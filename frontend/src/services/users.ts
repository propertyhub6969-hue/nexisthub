import api from './api'
import type { TeamMember, TeamMemberCreate, TeamMemberUpdate } from '../types'

export const usersService = {
  async list(): Promise<TeamMember[]> {
    const { data } = await api.get<TeamMember[]>('/team/users')
    return data
  },

  async create(payload: TeamMemberCreate): Promise<TeamMember> {
    const { data } = await api.post<TeamMember>('/team/users', payload)
    return data
  },

  async update(id: string, payload: TeamMemberUpdate): Promise<TeamMember> {
    const { data } = await api.patch<TeamMember>(`/team/users/${id}`, payload)
    return data
  },

  async resetPassword(id: string, password: string): Promise<void> {
    await api.post(`/team/users/${id}/reset-password`, { password })
  },
}
