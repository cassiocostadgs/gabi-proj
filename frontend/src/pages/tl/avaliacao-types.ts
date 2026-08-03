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
  pergunta: string
  notaKey: keyof EvalProposal
  paraKey: keyof EvalProposal
}> = [
  {
    label: 'Comportamental',
    pergunta: 'Como ele se posicionou frente ao time, às prioridades e aos combinados?',
    notaKey: 'comportamentalNota',
    paraKey: 'comportamentalParagrafo',
  },
  {
    label: 'Técnica',
    pergunta: 'A execução técnica do mês dá evidência suficiente para o nível esperado do papel?',
    notaKey: 'tecnicaNota',
    paraKey: 'tecnicaParagrafo',
  },
  {
    label: 'Prazos de Entrega',
    pergunta: 'Os compromissos assumidos na sprint foram cumpridos dentro do combinado?',
    notaKey: 'prazoNota',
    paraKey: 'prazoParagrafo',
  },
]

// Heuristic mirror of the backend's Gate A prompt (web/tl_evaluation_engine.py) — when the
// assistant's question is asking for external recognition, offer quick-reply chips instead of
// forcing free text for what is effectively a yes/no answer. Excludes open-ended follow-ups
// ("quem reconheceu?", "de que forma?") where a yes/no chip would not make sense as a reply.
const OPEN_ENDED_MARKERS = /\b(quem|como|qual|quais|quando|onde|de que forma|por que|porque)\b/i

export function isGateAQuestion(question: string): boolean {
  return /reconhec/i.test(question) && question.includes('?') && !OPEN_ENDED_MARKERS.test(question)
}

export const GATE_A_CHIPS = ['Sim, foi reconhecido', 'Não, é apenas minha percepção']
