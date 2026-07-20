import type { ChatMessage } from '../../types'

export interface EvalProposal {
  comportamentalNota: number
  comportamentalParagrafo: string
  tecnicaNota: number
  tecnicaParagrafo: string
  prazoNota: number
  prazoParagrafo: string
  janelaReduzida: boolean
}

export interface MemberChatState {
  messages: ChatMessage[]
  proposal: EvalProposal | null
  error: string | null
  // Local-only banner (e.g. "avaliação reaberta") — never sent to the chat API.
  note: string | null
}

export const EMPTY_CHAT: MemberChatState = {
  messages: [],
  proposal: null,
  error: null,
  note: null,
}

export const DIMENSIONS: Array<{
  label: string
  notaKey: keyof EvalProposal
  paraKey: keyof EvalProposal
}> = [
  { label: 'Comportamental', notaKey: 'comportamentalNota', paraKey: 'comportamentalParagrafo' },
  { label: 'Técnica', notaKey: 'tecnicaNota', paraKey: 'tecnicaParagrafo' },
  { label: 'Prazos de Entrega', notaKey: 'prazoNota', paraKey: 'prazoParagrafo' },
]

// Heuristic mirror of the backend's Gate A prompt (web/tl_evaluation_engine.py) — when the
// assistant's question is asking for external recognition, offer quick-reply chips instead of
// forcing free text for what is effectively a yes/no answer.
export function isGateAQuestion(question: string): boolean {
  return /reconhec/i.test(question) && question.includes('?')
}

export const GATE_A_CHIPS = ['Sim, foi reconhecido', 'Não, é apenas minha percepção']
