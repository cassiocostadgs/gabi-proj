import api from './api'
import type { TaskUpload, User } from '../types'

export const adminService = {
  listUsers: async (): Promise<User[]> => {
    const { data } = await api.get<{ users: User[] }>('/api/admin/users')
    return data.users
  },

  createUser: async (email: string, password: string, isAdmin = false): Promise<void> => {
    await api.post('/api/admin/users', { email, password, is_admin: isAdmin })
  },

  toggleUser: async (userId: number): Promise<void> => {
    await api.patch(`/api/admin/users/${userId}/toggle`)
  },

  deleteUser: async (userId: number): Promise<void> => {
    await api.delete(`/api/admin/users/${userId}`)
  },

  listTasks: async (): Promise<TaskUpload[]> => {
    const { data } = await api.get<{ tasks: TaskUpload[] }>('/api/admin/tasks')
    return data.tasks
  },

  uploadTask: async (file: File, competencia: string): Promise<void> => {
    const form = new FormData()
    form.append('task', file)
    form.append('competencia', competencia)
    await api.post('/api/admin/task', form)
  },

  deleteTask: async (taskId: number): Promise<void> => {
    await api.delete(`/api/admin/task/${taskId}`)
  },
}
