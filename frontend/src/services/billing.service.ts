import api from './api'
import { competenciaLabel, competenciaSlash } from '../lib/format'
import type {
  BillingRate,
  TeamMember,
  Submission,
  SubmissionDetail,
  SubmissionStatusResponse,
  SubmissionsSummary,
  MissingMember,
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

  deactivateMember: async (id: number, deactivated_from_competencia: string): Promise<void> => {
    await api.patch(`/api/admin/team/${id}/deactivate`, { deactivated_from_competencia })
  },

  activateMember: async (id: number): Promise<void> => {
    await api.patch(`/api/admin/team/${id}/activate`)
  },

  // ── Submissions (user) ────────────────────────────────────────────────────────

  submit: async (gaFile: File, competencia: string, result: ValidationResult): Promise<void> => {
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

  getMissingSubmissions: async (competencia: string): Promise<MissingMember[]> => {
    const { data } = await api.get<{ missing: MissingMember[] }>(
      `/api/admin/submissions/${competencia}/missing`
    )
    return data.missing
  },

  previewSubmission: async (
    id: number
  ): Promise<{
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

  exportBillingWithFiles: async (
    competencia: string,
    submissions: Submission[],
    email: { to: string; tag: string }
  ): Promise<string | null> => {
    let dirHandle: FileSystemDirectoryHandle
    try {
      dirHandle = await globalThis.showDirectoryPicker({ mode: 'readwrite' })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null
      throw err
    }
    const safe = competencia.replace('-', '_')

    const billingResp = await api.get(`/api/admin/billing/${competencia}/export`, {
      responseType: 'arraybuffer',
    })
    const billingHandle = await dirHandle.getFileHandle(`faturamento_${safe}.xlsx`, {
      create: true,
    })
    const billingWritable = await billingHandle.createWritable()
    await billingWritable.write(billingResp.data as ArrayBuffer)
    await billingWritable.close()

    const approved = submissions.filter((s) => s.status === 'approved')
    for (const sub of approved) {
      const gaResp = await api.get(`/api/admin/submissions/${sub.id}/ga-file`, {
        responseType: 'arraybuffer',
      })
      const ext = sub.ga_filename.split('.').pop() ?? 'xlsx'
      const safeName = sub.nome_profissional
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
      const gaHandle = await dirHandle.getFileHandle(`GA_${safeName}_${safe}.${ext}`, {
        create: true,
      })
      const gaWritable = await gaHandle.createWritable()
      await gaWritable.write(gaResp.data as ArrayBuffer)
      await gaWritable.close()
    }

    if (email.to) {
      await _copyEmailTemplateToClipboard(competencia, approved)
      const clientTag = email.tag ? `[${email.tag}]` : ''
      const subject = encodeURIComponent(
        `[DB1]${clientTag} Faturamento | ${competenciaSlash(competencia)}`
      )
      return `mailto:${email.to}?subject=${subject}`
    }
    return null
  },
}

function _greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function _buildEmailHtml(competencia: string, submissions: Submission[]): string {
  const sorted = [...submissions].sort((a, b) => a.subcontrato.localeCompare(b.subcontrato))
  const rows = sorted
    .map(
      (s, i) => `
    <tr style="background-color:${i % 2 === 0 ? '#ffffff' : '#dce6f1'}">
      <td style="border:1px solid #9dc3e6;padding:5px 12px;text-align:center;font-size:11pt">${s.subcontrato}</td>
      <td style="border:1px solid #9dc3e6;padding:5px 12px;font-size:11pt">${s.nome_profissional}</td>
    </tr>`
    )
    .join('')

  return `
<p style="font-family:Calibri,Arial,sans-serif;font-size:11pt">${_greeting()}. Tudo bem?</p>
<p style="font-family:Calibri,Arial,sans-serif;font-size:11pt">
  Seguem anexos os relatórios de horas trabalhadas, dos seguintes colaboradores DB1:
</p>
<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif">
  <thead>
    <tr style="background-color:#1f4e79;color:#ffffff">
      <th style="border:1px solid #2e75b6;padding:5px 12px;text-align:center;font-size:11pt">N° SUBCONTRATO</th>
      <th style="border:1px solid #2e75b6;padding:5px 12px;text-align:center;font-size:11pt">NOME DO PROFISSIONAL</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<p style="font-family:Calibri,Arial,sans-serif;font-size:11pt"><strong>Observações:</strong></p>
<p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#7f7f7f">
  [Adicionar observações aqui — competência ${competenciaLabel(competencia)}]
</p>`
}

function _buildEmailPlain(competencia: string, submissions: Submission[]): string {
  const sorted = [...submissions].sort((a, b) => a.subcontrato.localeCompare(b.subcontrato))
  const lines = sorted.map((s) => `${s.subcontrato} - ${s.nome_profissional}`).join('\n')
  return `${_greeting()}. Tudo bem?\n\nSeguem anexos os relatórios de horas trabalhadas, dos seguintes colaboradores DB1:\n\n${lines}\n\nObservações:\n[Adicionar observações aqui — competência ${competenciaLabel(competencia)}]`
}

async function _copyEmailTemplateToClipboard(
  competencia: string,
  submissions: Submission[]
): Promise<void> {
  const html = _buildEmailHtml(competencia, submissions)
  const plain = _buildEmailPlain(competencia, submissions)
  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' }),
    }),
  ])
}
