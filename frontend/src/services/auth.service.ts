import api from './api'
import type { AuthMe, TokenResponse } from '../types'

export const authService = {
  login: async (email: string, password: string): Promise<TokenResponse> => {
    const form = new FormData()
    form.append('username', email)
    form.append('password', password)
    const { data } = await api.post<TokenResponse>('/auth/login', form)
    return data
  },

  me: async (): Promise<AuthMe> => {
    const { data } = await api.get<AuthMe>('/auth/me')
    return data
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await api.post('/auth/change-password', null, {
      params: { current_password: currentPassword, new_password: newPassword },
    })
  },
}
