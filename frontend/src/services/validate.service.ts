import api from './api'
import type { Competencia, TaskStatus, ValidationResult } from '../types'

export const validateService = {
  getTaskStatus: async (): Promise<TaskStatus> => {
    const { data } = await api.get<TaskStatus>('/api/task/status')
    return data
  },

  getCompetencias: async (): Promise<Competencia[]> => {
    const { data } = await api.get<{ competencias: Competencia[] }>('/api/task/competencias')
    return data.competencias
  },

  getOracleStatus: async (): Promise<boolean> => {
    const { data } = await api.get<{ available: boolean }>('/api/oracle/status')
    return data.available
  },

  validate: async (
    gaFiles: File[],
    startDate: string,
    endDate: string,
    useFileFallback = false,
    competencia?: string
  ): Promise<ValidationResult> => {
    const form = new FormData()
    gaFiles.forEach((f) => form.append('ga', f))
    form.append('start_date', startDate)
    form.append('end_date', endDate)
    form.append('use_file_fallback', String(useFileFallback))
    if (competencia) form.append('competencia', competencia)
    const { data } = await api.post<ValidationResult>('/api/validate', form)
    return data
  },
}
