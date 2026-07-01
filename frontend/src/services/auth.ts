import api from './api'
import type { LoginPayload, RegisterPayload, Token, UserResponse } from '../types'

export const authService = {
  async login(payload: LoginPayload): Promise<Token> {
    const { data } = await api.post<Token>('/auth/login', payload)
    return data
  },

  async register(payload: RegisterPayload): Promise<UserResponse> {
    const { data } = await api.post<UserResponse>('/auth/register', payload)
    return data
  },

  async refresh(refresh_token: string): Promise<Token> {
    const { data } = await api.post<Token>('/auth/refresh', { refresh_token })
    return data
  },

  async me(): Promise<UserResponse> {
    const { data } = await api.get<UserResponse>('/auth/me')
    return data
  },

  setTokens(token: Token) {
    localStorage.setItem('access_token', token.access_token)
    localStorage.setItem('refresh_token', token.refresh_token)
  },

  clearTokens() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('access_token')
  },
}
