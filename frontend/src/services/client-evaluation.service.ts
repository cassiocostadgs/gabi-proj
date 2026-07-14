import api from './api'
import type { ClientEvaluation, ClientEvaluationDraft, ClientEvaluationDashboard } from '../types'

interface IngestResult {
  id: number
  status: string
  origem: string
  competencia: string
}

interface DashboardFilters {
  userEmail?: string
  competenciaFrom?: string
  competenciaTo?: string
}

export const clientEvaluationService = {
  ingest: async (emailBody: string, confirmOverride = false): Promise<IngestResult> => {
    const params = confirmOverride ? { confirm_override: true } : {}
    const { data } = await api.post<IngestResult>(
      '/api/admin/client-evaluations/ingest',
      { email_body: emailBody },
      { params }
    )
    return data
  },

  listEvaluations: async (statusFilter?: string): Promise<ClientEvaluation[]> => {
    const params = statusFilter ? { status: statusFilter } : {}
    const { data } = await api.get<{ evaluations: ClientEvaluation[] }>(
      '/api/admin/client-evaluations',
      { params }
    )
    return data.evaluations
  },

  getEvaluation: async (id: number): Promise<ClientEvaluation> => {
    const { data } = await api.get<ClientEvaluation>(`/api/admin/client-evaluations/${id}`)
    return data
  },

  updateEvaluation: async (id: number, draft: ClientEvaluationDraft): Promise<void> => {
    await api.patch(`/api/admin/client-evaluations/${id}`, draft)
  },

  approveEvaluation: async (id: number): Promise<void> => {
    await api.post(`/api/admin/client-evaluations/${id}/approve`)
  },

  rejectEvaluation: async (id: number): Promise<void> => {
    await api.post(`/api/admin/client-evaluations/${id}/reject`)
  },

  getDashboard: async (filters: DashboardFilters): Promise<ClientEvaluationDashboard[]> => {
    const params: Record<string, string> = {}
    if (filters.userEmail) params.user_email = filters.userEmail
    if (filters.competenciaFrom) params.competencia_from = filters.competenciaFrom
    if (filters.competenciaTo) params.competencia_to = filters.competenciaTo
    const { data } = await api.get<{ data: ClientEvaluationDashboard[] }>(
      '/api/admin/client-evaluations/dashboard',
      { params }
    )
    return data.data
  },

  getMyEvaluations: async (): Promise<ClientEvaluation[]> => {
    const { data } = await api.get<{ evaluations: ClientEvaluation[] }>('/api/my-evaluations')
    return data.evaluations
  },
}
