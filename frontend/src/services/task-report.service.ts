import api from './api'
import type { TaskReportDay, TaskReportExportFilters } from '../types'

function exportFilterParams(filters: TaskReportExportFilters) {
  return {
    only_faturado: filters.onlyFaturado,
    only_default_project: filters.onlyDefaultProject,
  }
}

export const taskReportService = {
  getDefaultProject: async (): Promise<string> => {
    const { data } = await api.get<{ project: string }>('/api/task/default-project')
    return data.project
  },

  getMyEntries: async (startDate: string, endDate: string): Promise<TaskReportDay[]> => {
    const { data } = await api.get<{ days: TaskReportDay[] }>('/api/task/my-entries', {
      params: { start_date: startDate, end_date: endDate },
    })
    return data.days
  },

  exportMyEntries: async (
    startDate: string,
    endDate: string,
    filters: TaskReportExportFilters
  ): Promise<Blob> => {
    const { data } = await api.get('/api/task/my-entries/export', {
      params: { start_date: startDate, end_date: endDate, ...exportFilterParams(filters) },
      responseType: 'blob',
    })
    return data
  },

  getEntriesFor: async (
    email: string,
    startDate: string,
    endDate: string
  ): Promise<TaskReportDay[]> => {
    const { data } = await api.get<{ days: TaskReportDay[] }>('/api/admin/task/entries', {
      params: { email, start_date: startDate, end_date: endDate },
    })
    return data.days
  },

  exportEntriesFor: async (
    email: string,
    startDate: string,
    endDate: string,
    filters: TaskReportExportFilters
  ): Promise<Blob> => {
    const { data } = await api.get('/api/admin/task/entries/export', {
      params: { email, start_date: startDate, end_date: endDate, ...exportFilterParams(filters) },
      responseType: 'blob',
    })
    return data
  },
}
