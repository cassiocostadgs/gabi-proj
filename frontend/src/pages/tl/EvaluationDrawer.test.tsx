import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EvaluationDrawer } from './EvaluationDrawer'
import type { SquadMember } from '../../types'
import type { MemberChatState } from './avaliacao-types'

const member: SquadMember = {
  id: 1,
  squadId: 1,
  nome: 'Bruno Fernandez',
  roleId: 1,
  papel: 'Desenvolvedor',
  senioridade: 'Pleno',
  fornecedor: 'DB1',
  active: true,
}

const baseProps = {
  member,
  competencia: '2026-07',
  isClosed: false,
  confirmedEval: undefined,
  userInput: '',
  isSending: false,
  isConfirming: false,
  onInput: () => {},
  onSend: () => {},
  onUpdateProposal: () => {},
  onConfirm: () => {},
  onReopenEvaluation: () => {},
  onClose: () => {},
}

const proposalChat: MemberChatState = {
  messages: [
    { role: 'user', content: 'ele foi ovacionado na review' },
    {
      role: 'assistant',
      content:
        'Preparei uma proposta de avaliação com base no que você relatou — revise as notas e parágrafos abaixo.',
    },
  ],
  proposal: {
    comportamentalNota: 5,
    comportamentalParagrafo: 'Demonstrou excelente colaboração.',
    tecnicaNota: 5,
    tecnicaParagrafo: 'Entregou a integração com qualidade.',
    prazoNota: 4,
    prazoParagrafo: 'Cumpriu os prazos combinados.',
    janelaReduzida: false,
  },
  error: null,
  note: null,
}

describe('EvaluationDrawer — proposal visibility', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('renders the ProposalCard once a proposal turn arrives', () => {
    render(<EvaluationDrawer {...baseProps} chat={proposalChat} />)
    expect(
      screen.getByText(/Proposta de avaliação — revise antes de confirmar/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/Confirmar avaliação/i)).toBeInTheDocument()
  })

  it('scrolls to the top of the proposal card, not just the trailing marker', () => {
    render(<EvaluationDrawer {...baseProps} chat={proposalChat} />)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'start' })
    )
  })

  it('falls back to scrolling the thread end when there is no proposal yet', () => {
    const askingChat: MemberChatState = {
      messages: [{ role: 'assistant', content: 'Pode dar um exemplo concreto?' }],
      proposal: null,
      error: null,
      note: null,
    }
    render(<EvaluationDrawer {...baseProps} chat={askingChat} />)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
      expect.not.objectContaining({ block: 'start' })
    )
  })
})
