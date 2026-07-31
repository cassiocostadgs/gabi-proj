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

export interface TaskEntry {
  date: string
  project: string
  task_code: string
  description: string
  area: string
  start: string
  end: string
  hours: number
  unexpected_area: boolean
}

export interface TaskReportDay {
  date: string
  entries: TaskEntry[]
  total: number
}

export interface TaskReportExportFilters {
  onlyFaturado: boolean
  onlyDefaultProject: boolean
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

export interface ResultsNavigationState extends ValidationResult {
  competencia?: string
}

// ── Billing / Approval ────────────────────────────────────────────────────────

export interface BillingRate {
  profile: string
  valor_hora: number
}

export interface TeamMember {
  id: number
  user_email: string
  cpf: string
  subcontrato: string
  profile: string
  nome_completo: string
  is_active: boolean
  deactivated_from_competencia: string | null
  created_at: string
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected'

export interface Submission {
  id: number
  user_email: string
  competencia: string
  nome_profissional: string
  task_id: string
  horas_task: number
  ga_filename: string
  subcontrato: string
  status: SubmissionStatus
  rejection_reason: string | null
  submitted_at: string
  reviewed_at: string | null
  reviewed_by: string | null
}

export interface SubmissionStatusResponse {
  submitted: boolean
  id?: number
  status?: SubmissionStatus
  rejection_reason?: string | null
  submitted_at?: string
}

export interface SubmissionDetail extends Omit<Submission, 'user_email'> {
  snapshot: Person | null
  snapshot_source: 'approved' | 'original' | null
}

export interface CompetenciaSummary {
  competencia: string
  total_submitted: number
  total_approved: number
  total_pending: number
  total_rejected: number
  total_members: number
}

export interface SubmissionsSummary {
  total_members: number
  competencias: CompetenciaSummary[]
}

export interface MissingMember {
  user_email: string
}

export interface AppSettings {
  billing_cnpj: string
  [key: string]: string
}

// ── Client Evaluation ─────────────────────────────────────────────────────────

export type MatchStatus = 'auto' | 'manual' | 'nao_vinculado'
export type EvaluationStatus = 'rascunho' | 'aprovado' | 'rejeitado'
export type EvaluationOrigem = 'manual' | 'automacao'

// Shape shared by every screen that only needs to plot/summarize scores
// (EvaluationSummary, EvaluationChart, EvaluationHistory) — both the
// per-user record and the admin dashboard's aggregated row satisfy it.
export interface EvaluationScoreRecord {
  competencia: string
  comportamental_nota: number | null
  comportamental_comentario: string | null
  tecnica_nota: number | null
  tecnica_comentario: string | null
  prazo_nota: number | null
  prazo_comentario: string | null
  comentario_geral: string | null
}

export interface ClientEvaluation extends EvaluationScoreRecord {
  id: number
  nome_extraido: string
  user_email: string | null
  match_status: MatchStatus
  fornecedor_validado: number
  raw_email_text: string
  email_message_id: string | null
  origem: EvaluationOrigem
  status: EvaluationStatus
  created_by: string
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  edited_by: string | null
  edited_at: string | null
}

export interface ClientEvaluationDraft {
  user_email?: string | null
  comportamental_nota?: number | null
  comportamental_comentario?: string | null
  tecnica_nota?: number | null
  tecnica_comentario?: string | null
  prazo_nota?: number | null
  prazo_comentario?: string | null
  comentario_geral?: string | null
}

export interface ClientEvaluationDashboard extends EvaluationScoreRecord {
  user_email: string
  nome_extraido: string
}

// ── TL Evaluation domain ──────────────────────────────────────────────────────

export interface Squad {
  id: number
  nome: string
  techLeadUserEmail: string
}

export interface RoleResponsibility {
  id: number
  descricao: string
  principal: boolean
  ordem: number
}

export interface Role {
  id: number
  nome: string
  descricao: string | null
  categoria: string | null
  responsabilidades: RoleResponsibility[]
}

export interface SquadMember {
  id: number
  squadId: number
  nome: string
  roleId: number
  papel: string // role display name (joined from the catalog)
  senioridade: string
  fornecedor: string
  active: boolean
}

export interface TlEvaluation {
  id: number
  squadMemberId: number
  nome?: string
  competencia: string
  comportamentalNota: number
  comportamentalParagrafo: string
  tecnicaNota: number
  tecnicaParagrafo: string
  prazoNota: number
  prazoParagrafo: string
  status: 'confirmado'
  confirmedBy: string
  confirmedAt: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type ChatTurn =
  | { type: 'ask_question'; question: string }
  | {
      type: 'propose_evaluation'
      comportamentalNota: number
      comportamentalParagrafo: string
      tecnicaNota: number
      tecnicaParagrafo: string
      prazoNota: number
      prazoParagrafo: string
    }

export interface SquadCompetenciaStatus {
  closed: boolean
  closedAt?: string
  closedBy?: string
}

// ── TL Evaluation — prompt admin (003-tl-evaluation-prompt-admin) ─────────────

export type PromptSectionKey =
  | 'papel'
  | 'fluxo'
  | 'gateA'
  | 'gateB'
  | 'regras'
  | 'instrucao'
  | 'adicionais'

export interface PromptSection {
  content: string
  updatedBy: string
  updatedAt: string
}

export interface PromptSectionHistoryEntry {
  content: string
  changedBy: string
  changedAt: string
}

export interface PromptSettings {
  sections: Record<PromptSectionKey, PromptSection>
  escalaReferencia: string
  forbiddenWords: string[]
  model: string
  maxTokens: number
}
