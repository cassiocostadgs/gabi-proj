import api from './api'
import type {
  Squad,
  SquadMember,
  TlEvaluation,
  ChatMessage,
  ChatTurn,
  SquadCompetenciaStatus,
} from '../types'

// ── Mappers (snake_case API → camelCase domain types) ─────────────────────────

function toSquad(raw: Record<string, unknown>): Squad {
  return {
    id: raw.id as number,
    nome: raw.nome as string,
    techLeadUserEmail: raw.tech_lead_user_email as string,
  }
}

function toSquadMember(raw: Record<string, unknown>): SquadMember {
  return {
    id: raw.id as number,
    squadId: raw.squad_id as number,
    nome: raw.nome as string,
    papel: raw.papel as string,
    senioridade: raw.senioridade as string,
    fornecedor: raw.fornecedor as string,
    active: Boolean(raw.ativo),
  }
}

function toTlEvaluation(raw: Record<string, unknown>): TlEvaluation {
  return {
    id: raw.id as number,
    squadMemberId: raw.squad_member_id as number,
    nome: raw.nome as string | undefined,
    competencia: raw.competencia as string,
    comportamentalNota: raw.comportamental_nota as number,
    comportamentalParagrafo: raw.comportamental_paragrafo as string,
    tecnicaNota: raw.tecnica_nota as number,
    tecnicaParagrafo: raw.tecnica_paragrafo as string,
    prazoNota: raw.prazo_nota as number,
    prazoParagrafo: raw.prazo_paragrafo as string,
    status: 'confirmado',
    confirmedBy: raw.confirmed_by as string,
    confirmedAt: raw.confirmed_at as string,
  }
}

function toChatTurn(raw: Record<string, unknown>): ChatTurn {
  if (raw.type === 'ask_question') {
    return { type: 'ask_question', question: raw.question as string }
  }
  return {
    type: 'propose_evaluation',
    comportamentalNota: raw.comportamental_nota as number,
    comportamentalParagrafo: raw.comportamental_paragrafo as string,
    tecnicaNota: raw.tecnica_nota as number,
    tecnicaParagrafo: raw.tecnica_paragrafo as string,
    prazoNota: raw.prazo_nota as number,
    prazoParagrafo: raw.prazo_paragrafo as string,
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export const tlEvaluationService = {
  // Squad (admin)
  createSquad: async (nome: string, techLeadUserEmail: string): Promise<Squad> => {
    const { data } = await api.post<Record<string, unknown>>('/api/admin/squads', {
      nome,
      tech_lead_user_email: techLeadUserEmail,
    })
    return toSquad(data)
  },

  listSquads: async (): Promise<Squad[]> => {
    const { data } = await api.get<{ squads: Record<string, unknown>[] }>('/api/admin/squads')
    return data.squads.map(toSquad)
  },

  updateSquad: async (
    id: number,
    fields: { nome?: string; techLeadUserEmail?: string }
  ): Promise<Squad> => {
    const body: Record<string, string> = {}
    if (fields.nome !== undefined) body.nome = fields.nome
    if (fields.techLeadUserEmail !== undefined) body.tech_lead_user_email = fields.techLeadUserEmail
    const { data } = await api.put<Record<string, unknown>>(`/api/admin/squads/${id}`, body)
    return toSquad(data)
  },

  listSquadMembersAdmin: async (squadId: number): Promise<SquadMember[]> => {
    const { data } = await api.get<{ members: Record<string, unknown>[] }>(
      `/api/admin/squads/${squadId}/members`
    )
    return data.members.map(toSquadMember)
  },

  // Squad (TL)
  listMySquads: async (): Promise<Squad[]> => {
    const { data } = await api.get<{ squads: Record<string, unknown>[] }>('/api/tl/squads')
    return data.squads.map(toSquad)
  },

  createMember: async (
    squadId: number,
    member: { nome: string; papel: string; senioridade: string; fornecedor: string }
  ): Promise<SquadMember> => {
    const { data } = await api.post<Record<string, unknown>>(
      `/api/tl/squads/${squadId}/members`,
      member
    )
    return toSquadMember(data)
  },

  listMembers: async (squadId: number, includeInactive = false): Promise<SquadMember[]> => {
    const { data } = await api.get<{ members: Record<string, unknown>[] }>(
      `/api/tl/squads/${squadId}/members`,
      { params: includeInactive ? { include_inactive: true } : undefined }
    )
    return data.members.map(toSquadMember)
  },

  updateMember: async (
    squadId: number,
    memberId: number,
    fields: Partial<{
      nome: string
      papel: string
      senioridade: string
      fornecedor: string
      active: boolean
    }>
  ): Promise<SquadMember> => {
    const body: Record<string, unknown> = {}
    if (fields.nome !== undefined) body.nome = fields.nome
    if (fields.papel !== undefined) body.papel = fields.papel
    if (fields.senioridade !== undefined) body.senioridade = fields.senioridade
    if (fields.fornecedor !== undefined) body.fornecedor = fields.fornecedor
    if (fields.active !== undefined) body.ativo = fields.active
    const { data } = await api.patch<Record<string, unknown>>(
      `/api/tl/squads/${squadId}/members/${memberId}`,
      body
    )
    return toSquadMember(data)
  },

  getHistorico: async (squadId: number): Promise<TlEvaluation[]> => {
    const { data } = await api.get<{ historico: Record<string, unknown>[] }>(
      `/api/tl/squads/${squadId}/historico`
    )
    return data.historico.map(toTlEvaluation)
  },

  // Evaluations
  sendChatTurn: async (
    squadId: number,
    competencia: string,
    squadMemberId: number,
    messages: ChatMessage[]
  ): Promise<ChatTurn> => {
    const { data } = await api.post<Record<string, unknown>>('/api/tl-evaluations/chat', {
      squad_id: squadId,
      competencia,
      squad_member_id: squadMemberId,
      messages,
    })
    return toChatTurn(data)
  },

  confirmEvaluation: async (payload: {
    squadId: number
    competencia: string
    squadMemberId: number
    comportamentalNota: number
    comportamentalParagrafo: string
    tecnicaNota: number
    tecnicaParagrafo: string
    prazoNota: number
    prazoParagrafo: string
    janelaReduzida: boolean
  }): Promise<void> => {
    await api.post('/api/tl-evaluations', {
      squad_id: payload.squadId,
      competencia: payload.competencia,
      squad_member_id: payload.squadMemberId,
      comportamental_nota: payload.comportamentalNota,
      comportamental_paragrafo: payload.comportamentalParagrafo,
      tecnica_nota: payload.tecnicaNota,
      tecnica_paragrafo: payload.tecnicaParagrafo,
      prazo_nota: payload.prazoNota,
      prazo_paragrafo: payload.prazoParagrafo,
      janela_reduzida: payload.janelaReduzida,
    })
  },

  listEvaluations: async (squadId: number, competencia: string): Promise<TlEvaluation[]> => {
    const { data } = await api.get<{ evaluations: Record<string, unknown>[] }>(
      '/api/tl-evaluations',
      { params: { squad_id: squadId, competencia } }
    )
    return data.evaluations.map(toTlEvaluation)
  },

  reopenEvaluation: async (
    squadId: number,
    competencia: string,
    squadMemberId: number
  ): Promise<void> => {
    await api.post(`/api/tl-evaluations/${squadId}/${competencia}/${squadMemberId}/reopen`)
  },

  closeCompetencia: async (
    squadId: number,
    competencia: string
  ): Promise<SquadCompetenciaStatus> => {
    const { data } = await api.post<Record<string, unknown>>(
      `/api/tl-evaluations/${squadId}/${competencia}/close`
    )
    return {
      closed: true,
      closedAt: data.closed_at as string,
      closedBy: data.closed_by as string,
    }
  },

  getClosureStatus: async (
    squadId: number,
    competencia: string
  ): Promise<SquadCompetenciaStatus> => {
    const { data } = await api.get<Record<string, unknown>>(
      `/api/tl-evaluations/${squadId}/${competencia}/close`
    )
    return {
      closed: data.closed as boolean,
      closedAt: data.closed_at as string | undefined,
      closedBy: data.closed_by as string | undefined,
    }
  },

  reopenCompetencia: async (squadId: number, competencia: string): Promise<void> => {
    await api.delete(`/api/tl-evaluations/${squadId}/${competencia}/close`)
  },

  downloadPdf: async (squadId: number, competencia: string): Promise<Blob> => {
    const { data } = await api.get<Blob>(`/api/tl-evaluations/${squadId}/${competencia}/pdf`, {
      responseType: 'blob',
    })
    return data
  },
}
