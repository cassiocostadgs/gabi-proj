import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EvaluationDrawer } from './EvaluationDrawer'
import type { Role, SquadMember } from '../../types'
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

const role: Role = {
  id: 1,
  nome: 'Desenvolvedor',
  descricao: 'Responsável por implementar e entregar o compromisso com qualidade.',
  categoria: 'Entrega Técnica',
  responsabilidades: [
    { id: 1, descricao: 'Desenvolve e testa funcionalidades', principal: true, ordem: 0 },
    { id: 2, descricao: 'Responsável por cumprir o DOD', principal: true, ordem: 1 },
    { id: 3, descricao: 'Participa de revisões de código', principal: false, ordem: 2 },
  ],
}

const baseProps = {
  member,
  role: undefined,
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

  it('renders the proposal card once a proposal turn arrives, starting on the first dimension', () => {
    render(<EvaluationDrawer {...baseProps} chat={proposalChat} />)
    expect(
      screen.getByText(/Proposta de avaliação — revise antes de confirmar/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/Etapa 1 de 3/i)).toBeInTheDocument()
    expect(screen.getByText('Comportamental')).toBeInTheDocument()
    expect(screen.queryByText(/Confirmar avaliação/i)).not.toBeInTheDocument()
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

describe('EvaluationDrawer — proposal wizard', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('disables "Voltar" on the first dimension', () => {
    render(<EvaluationDrawer {...baseProps} chat={proposalChat} />)
    expect(screen.getByText('Voltar')).toBeDisabled()
  })

  it('steps through each dimension to reach the summary, revealing the confirm button', async () => {
    const user = userEvent.setup()
    render(<EvaluationDrawer {...baseProps} chat={proposalChat} />)

    await user.click(screen.getByText(/Próximo/i))
    expect(screen.getByText('Técnica')).toBeInTheDocument()
    expect(screen.getByText(/Etapa 2 de 3/i)).toBeInTheDocument()

    await user.click(screen.getByText(/Próximo/i))
    expect(screen.getByText('Prazos de Entrega')).toBeInTheDocument()
    expect(screen.getByText(/Etapa 3 de 3/i)).toBeInTheDocument()

    await user.click(screen.getByText(/Próximo/i))
    expect(screen.getByText(/Resumo/i)).toBeInTheDocument()
    expect(screen.getByText(/Confirmar avaliação/i)).toBeInTheDocument()
  })

  it('lets the TL jump back to a dimension from the summary via "editar"', async () => {
    const user = userEvent.setup()
    render(<EvaluationDrawer {...baseProps} chat={proposalChat} />)

    await user.click(screen.getByText(/Próximo/i))
    await user.click(screen.getByText(/Próximo/i))
    await user.click(screen.getByText(/Próximo/i))
    expect(screen.getByText(/Resumo/i)).toBeInTheDocument()

    const editButtons = screen.getAllByText('editar')
    await user.click(editButtons[1]) // Técnica

    expect(screen.getByText(/Etapa 2 de 3/i)).toBeInTheDocument()
    expect(
      screen.getByDisplayValue('Entregou a integração com qualidade.')
    ).toBeInTheDocument()
  })
})

describe('EvaluationDrawer — role attributions panel', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  const askingChat: MemberChatState = {
    messages: [],
    proposal: null,
    error: null,
    note: null,
  }

  it('starts collapsed and reveals principal responsibilities on toggle', async () => {
    const user = userEvent.setup()
    render(<EvaluationDrawer {...baseProps} role={role} chat={askingChat} />)

    expect(screen.queryByText('Desenvolve e testa funcionalidades')).not.toBeInTheDocument()

    await user.click(screen.getByText(/Atribuições do papel \(2 principais\)/i))

    expect(screen.getByText('Desenvolve e testa funcionalidades')).toBeInTheDocument()
    expect(screen.getByText('Responsável por cumprir o DOD')).toBeInTheDocument()
    expect(screen.queryByText('Participa de revisões de código')).not.toBeInTheDocument()
  })

  it('reveals secondary responsibilities only after "Ver +N secundárias"', async () => {
    const user = userEvent.setup()
    render(<EvaluationDrawer {...baseProps} role={role} chat={askingChat} />)

    await user.click(screen.getByText(/Atribuições do papel/i))
    await user.click(screen.getByText(/Ver \+1 secundárias/i))

    expect(screen.getByText('Participa de revisões de código')).toBeInTheDocument()
  })

  it('does not render the panel when the member has no matched role', () => {
    render(<EvaluationDrawer {...baseProps} role={undefined} chat={askingChat} />)
    expect(screen.queryByText(/Atribuições do papel/i)).not.toBeInTheDocument()
  })
})
