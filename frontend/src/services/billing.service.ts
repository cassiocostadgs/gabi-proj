import api from './api'
import type {
  BillingRate,
  TeamMember,
  Submission,
  SubmissionDetail,
  SubmissionStatusResponse,
  SubmissionsSummary,
  AppSettings,
  ValidationResult,
  Person,
} from '../types'

export const billingService = {
  // ── Settings ────────────────────────────────────────────────────────────────

  getSettings: async (): Promise<AppSettings> => {
    const { data } = await api.get<AppSettings>('/api/admin/settings')
    return data
  },

  updateSetting: async (key: string, value: string): Promise<void> => {
    await api.put(`/api/admin/settings/${key}`, { value })
  },

  // ── Billing rates ────────────────────────────────────────────────────────────

  listRates: async (): Promise<BillingRate[]> => {
    const { data } = await api.get<{ rates: BillingRate[] }>('/api/admin/billing-rates')
    return data.rates
  },

  createRate: async (profile: string, valor_hora: number): Promise<void> => {
    await api.post('/api/admin/billing-rates', { profile, valor_hora })
  },

  updateRate: async (profile: string, valor_hora: number): Promise<void> => {
    await api.put(`/api/admin/billing-rates/${profile}`, { valor_hora })
  },

  deleteRate: async (profile: string): Promise<void> => {
    await api.delete(`/api/admin/billing-rates/${profile}`)
  },

  // ── Team members ─────────────────────────────────────────────────────────────

  listTeam: async (): Promise<TeamMember[]> => {
    const { data } = await api.get<{ members: TeamMember[] }>('/api/admin/team')
    return data.members
  },

  createMember: async (member: {
    user_email: string
    cpf: string
    subcontrato: string
    profile: string
  }): Promise<void> => {
    await api.post('/api/admin/team', member)
  },

  updateMember: async (
    id: number,
    member: { cpf: string; subcontrato: string; profile: string; is_active: boolean }
  ): Promise<void> => {
    await api.put(`/api/admin/team/${id}`, member)
  },

  deleteMember: async (id: number): Promise<void> => {
    await api.delete(`/api/admin/team/${id}`)
  },

  // ── Submissions (user) ────────────────────────────────────────────────────────

  submit: async (
    gaFile: File,
    competencia: string,
    result: ValidationResult
  ): Promise<void> => {
    const person = result.persons[0]
    if (!person) throw new Error('Nenhum resultado de validação disponível')

    const form = new FormData()
    form.append('ga', gaFile, gaFile.name)
    form.append('competencia', competencia)
    form.append('nome_profissional', person.name)
    form.append('task_id', person.task_id)
    form.append('horas_task', String(person.task_total))
    form.append('snapshot', JSON.stringify(person))
    await api.post('/api/submissions', form)
  },

  getSubmissionStatus: async (competencia: string): Promise<SubmissionStatusResponse> => {
    const { data } = await api.get<SubmissionStatusResponse>('/api/submissions/status', {
      params: { competencia },
    })
    return data
  },

  listMySubmissions: async (): Promise<Submission[]> => {
    const { data } = await api.get<{ submissions: Submission[] }>('/api/submissions/my')
    return data.submissions
  },

  getMySubmission: async (id: number): Promise<SubmissionDetail> => {
    const { data } = await api.get<SubmissionDetail>(`/api/submissions/${id}`)
    return data
  },

  // ── Submissions (admin) ───────────────────────────────────────────────────────

  getSummary: async (): Promise<SubmissionsSummary> => {
    const { data } = await api.get<SubmissionsSummary>('/api/admin/submissions/summary')
    return data
  },

  listSubmissions: async (competencia: string): Promise<Submission[]> => {
    const { data } = await api.get<{ submissions: Submission[] }>('/api/admin/submissions', {
      params: { competencia },
    })
    return data.submissions
  },

  previewSubmission: async (id: number): Promise<{
    person: Person
    submission_snapshot: Person
    is_immutable: boolean
    reviewed_at: string | null
    reviewed_by: string | null
  }> => {
    const { data } = await api.get(`/api/admin/submissions/${id}/preview`)
    return data
  },

  approveSubmission: async (id: number, person: Person): Promise<void> => {
    await api.patch(`/api/admin/submissions/${id}/approve`, {
      horas_task: person.task_total,
      approved_snapshot: JSON.stringify(person),
    })
  },

  rejectSubmission: async (id: number, reason: string): Promise<void> => {
    await api.patch(`/api/admin/submissions/${id}/reject`, { reason })
  },

  exportBilling: async (competencia: string): Promise<void> => {
    const resp = await api.get(`/api/admin/billing/${competencia}/export`, {
      responseType: 'blob',
    })
    const url = URL.createObjectURL(resp.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `faturamento_${competencia.replace('-', '_')}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  },
}
