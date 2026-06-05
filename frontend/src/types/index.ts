export interface User {
  id: number
  email: string
  is_admin: boolean
  is_active: boolean
  created_at: string
}

export interface AuthMe {
  email: string
  is_admin: boolean
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface TaskUpload {
  id: number
  filename: string
  competencia: string
  uploaded_at: string
  uploaded_by: string
}

export interface TaskStatus {
  available: boolean
  id?: number
  filename?: string
  competencia?: string
  uploaded_at?: string
  uploaded_by?: string
}

export interface Competencia {
  competencia: string
  uploaded_at: string
  uploaded_by: string
}

export type DayStatus = 'ok' | 'error' | 'warning' | 'info' | 'r0' | 'r4'

export interface DayResult {
  date: string
  ga: number
  task: number
  task_nf: number
  diff: number
  rules: string[]
  sevs: Record<string, string>
  status: DayStatus
  is_holiday: boolean
  holiday_name: string | null
}

export interface Issue {
  date: string
  rule: string
  severity: 'error' | 'warning' | 'info'
  message: string
}

export interface Person {
  name: string
  task_id: string
  month_label: string
  export_suffix: string
  ga_total: number
  task_total: number
  diff_total: number
  working_days: number
  monthly_limit: number
  mensal_ok: boolean
  issues_count: number
  errors_count: number
  warnings_count: number
  info_count: number
  days: DayResult[]
  issues: Issue[]
}

export interface ValidationResult {
  persons: Person[]
  errors: string[]
}
