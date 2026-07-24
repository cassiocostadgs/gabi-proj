import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Circle,
  AlertTriangle,
  Lock,
  RotateCcw,
  Download,
} from 'lucide-react'
import { Spinner } from '../../components/Spinner'
import { tlEvaluationService } from '../../services/tl-evaluation.service'
import {
  competenciaLabel,
  competenciaShort,
  currentCompetencia,
  addMonths,
  fmtDatetime,
} from '../../lib/format'
import axios from 'axios'
import type { SquadMember } from '../../types'
import { EMPTY_CHAT, type EvalProposal, type MemberChatState } from './avaliacao-types'
import { EvaluationDrawer } from './EvaluationDrawer'
import { PdfPreviewModal } from './PdfPreviewModal'

const STATUS_CLS: Record<string, string> = {
  pendente: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  confirmado: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  'nao-avaliado': 'bg-slate-700/20 border-slate-600/30 text-slate-500',
}
const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  'nao-avaliado': 'Não avaliado',
}
const STATUS_ICON: Record<string, typeof Clock> = {
  pendente: Clock,
  confirmado: CheckCircle2,
  'nao-avaliado': Circle,
}

function CompetenciaNav({
  competencia,
  confirmedCount,
  total,
  onShift,
  onSelect,
}: Readonly<{
  competencia: string
  confirmedCount: number
  total: number
  onShift: (delta: number) => void
  onSelect: (cid: string) => void
}>) {
  const pct = total > 0 ? Math.min(100, (confirmedCount / total) * 100) : 0
  const pills = [-2, -1, 0, 1].map((d) => addMonths(competencia, d))
  return (
    <div className="mb-5">
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => onShift(-1)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 text-center">
          <p className="text-sm font-semibold text-slate-200">{competenciaLabel(competencia)}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {total > 0 ? `${confirmedCount} de ${total} confirmados` : 'Nenhum membro cadastrado'}
          </p>
        </div>
        <button
          onClick={() => onShift(1)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="flex gap-1 justify-center mb-3">
        {pills.map((cid) => {
          const isSel = cid === competencia
          return (
            <button
              key={cid}
              onClick={() => onSelect(cid)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors border ${
                isSel
                  ? 'bg-blue-700/20 text-blue-300 border-blue-700/40'
                  : 'text-slate-600 border-transparent hover:text-slate-300 hover:border-slate-700'
              }`}
            >
              {competenciaShort(cid)}
            </button>
          )
        })}
      </div>
      <div className="w-full bg-slate-700/60 rounded-full h-1">
        <div
          className={`h-1 rounded-full transition-all ${
            confirmedCount >= total && total > 0 ? 'bg-emerald-500' : 'bg-blue-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function MemberRow({
  member,
  status,
  onClick,
}: Readonly<{ member: SquadMember; status: string; onClick: () => void }>) {
  const StatusIcon = STATUS_ICON[status]
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-slate-800/60 border border-slate-700 hover:border-slate-600 rounded-xl px-5 py-4 text-xs transition-colors group"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-200 truncate">{member.nome}</p>
          <p className="text-slate-500 mt-0.5 truncate">
            {member.papel} · {member.senioridade}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[0.65rem] font-bold ${STATUS_CLS[status]}`}
          >
            <StatusIcon size={11} />
            {STATUS_LABEL[status]}
          </span>
          <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400" />
        </div>
      </div>
    </button>
  )
}

function EvaluationFooterBar({
  isClosed,
  closedAt,
  totalMembers,
  confirmedCount,
  unconfirmedCount,
  allConfirmed,
  showCloseWarning,
  onShowCloseWarning,
  onCancelCloseWarning,
  onCloseCompetencia,
  isClosePending,
  onReopenCiclo,
  isReopenCicloPending,
  onOpenPdf,
}: Readonly<{
  isClosed: boolean
  closedAt: string | null | undefined
  totalMembers: number
  confirmedCount: number
  unconfirmedCount: number
  allConfirmed: boolean
  showCloseWarning: boolean
  onShowCloseWarning: () => void
  onCancelCloseWarning: () => void
  onCloseCompetencia: () => void
  isClosePending: boolean
  onReopenCiclo: () => void
  isReopenCicloPending: boolean
  onOpenPdf: () => void
}>) {
  if (isClosed) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-emerald-400">
          <Lock size={13} />
          Ciclo encerrado
          {closedAt && ` em ${fmtDatetime(closedAt)}`}
          <button
            onClick={onReopenCiclo}
            disabled={isReopenCicloPending}
            className="flex items-center gap-1 text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors disabled:opacity-50"
          >
            {isReopenCicloPending ? <Spinner size="sm" /> : <RotateCcw size={12} />}
            Reabrir ciclo
          </button>
        </div>
        <button
          onClick={onOpenPdf}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-sm transition-colors"
        >
          <Download size={14} />
          Ver PDF
        </button>
      </div>
    )
  }

  if (confirmedCount === 0) {
    return (
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-slate-500">Nenhuma avaliação confirmada ainda.</p>
        <button
          disabled
          className="px-4 py-2 bg-blue-700/30 text-white/30 font-semibold rounded-lg text-sm shrink-0"
        >
          Encerrar avaliação mensal
        </button>
      </div>
    )
  }

  if (showCloseWarning) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <AlertTriangle size={13} className="text-amber-400 shrink-0" />
            <p className="text-xs font-semibold text-amber-400">
              {unconfirmedCount} profissional{unconfirmedCount > 1 ? 'is' : ''} ainda não confirmado
              {unconfirmedCount > 1 ? 's' : ''}
            </p>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            O PDF incluirá somente os {confirmedCount} confirmados.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onCancelCloseWarning}
            className="px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onCloseCompetencia}
            disabled={isClosePending}
            className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5"
          >
            {isClosePending ? <Spinner size="sm" /> : <Lock size={12} />}
            Encerrar assim mesmo
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between">
      <p className={`text-xs ${allConfirmed ? 'text-emerald-400' : 'text-slate-500'}`}>
        {confirmedCount} de {totalMembers} confirmados
        {allConfirmed ? ' · pronto para encerrar.' : '.'}
      </p>
      <button
        onClick={() => (allConfirmed ? onCloseCompetencia() : onShowCloseWarning())}
        disabled={isClosePending}
        className={`flex items-center gap-2 px-4 py-2 font-semibold rounded-lg text-sm transition-colors ${
          allConfirmed
            ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
            : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
        }`}
      >
        {isClosePending ? <Spinner size="sm" /> : <Lock size={14} />}
        Encerrar avaliação mensal
      </button>
    </div>
  )
}

function useAvaliacaoTabController(squadId: number) {
  const qc = useQueryClient()
  const [competencia, setCompetencia] = useState(() => currentCompetencia())
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null)
  const [chatByMember, setChatByMember] = useState<Record<number, MemberChatState>>({})
  const [userInput, setUserInput] = useState('')
  const [showCloseWarning, setShowCloseWarning] = useState(false)
  const [pdfModalOpen, setPdfModalOpen] = useState(false)

  const { data: members = [] } = useQuery({
    queryKey: ['tl-members', squadId],
    queryFn: () => tlEvaluationService.listMembers(squadId),
  })

  const { data: confirmedEvals = [] } = useQuery({
    queryKey: ['tl-evaluations', squadId, competencia],
    queryFn: () => tlEvaluationService.listEvaluations(squadId, competencia),
    enabled: !!competencia,
  })

  const { data: closureStatus } = useQuery({
    queryKey: ['tl-closure', squadId, competencia],
    queryFn: () => tlEvaluationService.getClosureStatus(squadId, competencia),
    enabled: !!competencia,
  })

  const isClosed = closureStatus?.closed ?? false
  const confirmedSet = new Set(confirmedEvals.map((e) => e.squadMemberId))
  const confirmedCount = confirmedSet.size
  const unconfirmedCount = members.length - confirmedCount
  const allConfirmed = members.length > 0 && unconfirmedCount === 0

  function memberStatus(memberId: number): string {
    if (confirmedSet.has(memberId)) return 'confirmado'
    return isClosed ? 'nao-avaliado' : 'pendente'
  }

  const currentChat: MemberChatState =
    selectedMemberId === null ? EMPTY_CHAT : (chatByMember[selectedMemberId] ?? EMPTY_CHAT)

  const selectedMember = members.find((m) => m.id === selectedMemberId)
  const selectedMemberEval =
    selectedMemberId !== null && confirmedSet.has(selectedMemberId)
      ? confirmedEvals.find((e) => e.squadMemberId === selectedMemberId)
      : undefined

  function patchChat(memberId: number, patch: Partial<MemberChatState>) {
    setChatByMember((prev) => ({
      ...prev,
      [memberId]: { ...(prev[memberId] ?? EMPTY_CHAT), ...patch },
    }))
  }

  const chatMutation = useMutation({
    mutationFn: ({ messages }: { messages: MemberChatState['messages'] }) =>
      tlEvaluationService.sendChatTurn(squadId, competencia, selectedMemberId!, messages),
    onSuccess: (turn) => {
      if (!selectedMemberId) return
      if (turn.type === 'ask_question') {
        const existing = chatByMember[selectedMemberId] ?? EMPTY_CHAT
        patchChat(selectedMemberId, {
          messages: [...existing.messages, { role: 'assistant', content: turn.question }],
          proposal: null,
          error: null,
        })
      } else {
        const existing = chatByMember[selectedMemberId] ?? EMPTY_CHAT
        patchChat(selectedMemberId, {
          messages: [
            ...existing.messages,
            {
              role: 'assistant',
              content:
                'Preparei uma proposta de avaliação com base no que você relatou — revise as notas e parágrafos abaixo.',
            },
          ],
          proposal: {
            comportamentalNota: turn.comportamentalNota,
            comportamentalParagrafo: turn.comportamentalParagrafo,
            tecnicaNota: turn.tecnicaNota,
            tecnicaParagrafo: turn.tecnicaParagrafo,
            prazoNota: turn.prazoNota,
            prazoParagrafo: turn.prazoParagrafo,
            janelaReduzida: false,
          },
          error: null,
        })
      }
    },
    onError: (err: unknown) => {
      if (!selectedMemberId) return
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? 'Erro ao obter resposta da IA.')
        : 'Erro ao obter resposta da IA.'
      patchChat(selectedMemberId, { error: msg })
    },
  })

  const confirmMutation = useMutation({
    mutationFn: (proposal: EvalProposal) =>
      tlEvaluationService.confirmEvaluation({
        squadId,
        competencia,
        squadMemberId: selectedMemberId!,
        comportamentalNota: proposal.comportamentalNota,
        comportamentalParagrafo: proposal.comportamentalParagrafo,
        tecnicaNota: proposal.tecnicaNota,
        tecnicaParagrafo: proposal.tecnicaParagrafo,
        prazoNota: proposal.prazoNota,
        prazoParagrafo: proposal.prazoParagrafo,
        janelaReduzida: proposal.janelaReduzida,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tl-evaluations', squadId, competencia] })
      qc.invalidateQueries({ queryKey: ['tl-closure', squadId, competencia] })
      if (selectedMemberId !== null) {
        setChatByMember((prev) => {
          const next = { ...prev }
          delete next[selectedMemberId]
          return next
        })
      }
      setSelectedMemberId(null)
    },
  })

  const closeMutation = useMutation({
    mutationFn: () => tlEvaluationService.closeCompetencia(squadId, competencia),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tl-closure', squadId, competencia] })
      setShowCloseWarning(false)
    },
  })

  const reopenCicloMutation = useMutation({
    mutationFn: () => tlEvaluationService.reopenCompetencia(squadId, competencia),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tl-closure', squadId, competencia] })
    },
  })

  const reopenEvaluationMutation = useMutation({
    mutationFn: (memberId: number) =>
      tlEvaluationService.reopenEvaluation(squadId, competencia, memberId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tl-evaluations', squadId, competencia] })
      qc.invalidateQueries({ queryKey: ['tl-closure', squadId, competencia] })
    },
  })

  const downloadMutation = useMutation({
    mutationFn: () => tlEvaluationService.downloadPdf(squadId, competencia),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `avaliacao-${competencia}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    },
  })

  function shiftCompetencia(delta: number) {
    selectCompetencia(addMonths(competencia, delta))
  }

  function selectCompetencia(cid: string) {
    setCompetencia(cid)
    setSelectedMemberId(null)
    setShowCloseWarning(false)
    setPdfModalOpen(false)
  }

  function handleSend(textOverride?: string) {
    const text = (textOverride ?? userInput).trim()
    if (!text || !selectedMemberId) return
    const newMsg = { role: 'user' as const, content: text }
    const existing = chatByMember[selectedMemberId] ?? EMPTY_CHAT
    const nextMessages = [...existing.messages, newMsg]
    patchChat(selectedMemberId, { messages: nextMessages, error: null })
    if (textOverride === undefined) setUserInput('')
    chatMutation.mutate({ messages: nextMessages })
  }

  function updateProposal(memberId: number, patch: Partial<EvalProposal>) {
    const existing = chatByMember[memberId] ?? EMPTY_CHAT
    if (!existing.proposal) return
    patchChat(memberId, { proposal: { ...existing.proposal, ...patch } })
  }

  function handleReopenEvaluation(memberId: number) {
    const ev = confirmedEvals.find((e) => e.squadMemberId === memberId)
    if (!ev) return
    const wasClosed = isClosed
    // Mirrors the prototype's reopenEvaluation(): un-confirms the evaluation server-side
    // (status -> rascunho) and reopens the squad's closure in one atomic call, so counts,
    // badges, and the closed bar all agree the moment the query cache refetches.
    reopenEvaluationMutation.mutate(memberId)
    patchChat(memberId, {
      messages: [],
      error: null,
      note: wasClosed
        ? 'Avaliação reaberta para ajustes — isso também reabriu o encerramento mensal da squad.'
        : 'Avaliação reaberta para ajustes.',
      proposal: {
        comportamentalNota: ev.comportamentalNota,
        comportamentalParagrafo: ev.comportamentalParagrafo,
        tecnicaNota: ev.tecnicaNota,
        tecnicaParagrafo: ev.tecnicaParagrafo,
        prazoNota: ev.prazoNota,
        prazoParagrafo: ev.prazoParagrafo,
        janelaReduzida: false,
      },
    })
  }

  return {
    competencia,
    members,
    confirmedEvals,
    closureStatus,
    isClosed,
    confirmedCount,
    unconfirmedCount,
    allConfirmed,
    memberStatus,
    currentChat,
    selectedMember,
    selectedMemberEval,
    selectedMemberId,
    setSelectedMemberId,
    userInput,
    setUserInput,
    showCloseWarning,
    setShowCloseWarning,
    pdfModalOpen,
    setPdfModalOpen,
    shiftCompetencia,
    selectCompetencia,
    handleSend,
    updateProposal,
    handleReopenEvaluation,
    chatMutation,
    confirmMutation,
    closeMutation,
    reopenCicloMutation,
    downloadMutation,
  }
}

export function AvaliacaoTab({
  squadId,
  squadName,
}: Readonly<{ squadId: number; squadName: string }>) {
  const c = useAvaliacaoTabController(squadId)

  return (
    <div className={`max-w-2xl mx-auto ${c.members.length > 0 ? 'pb-24' : ''}`}>
      <CompetenciaNav
        competencia={c.competencia}
        confirmedCount={c.confirmedCount}
        total={c.members.length}
        onShift={c.shiftCompetencia}
        onSelect={c.selectCompetencia}
      />

      {c.members.length === 0 ? (
        <p className="text-xs text-slate-600 text-center py-10">
          Cadastre membros na aba Membros antes de avaliar.
        </p>
      ) : (
        <div className="space-y-2">
          {c.members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              status={c.memberStatus(member.id)}
              onClick={() => c.setSelectedMemberId(member.id)}
            />
          ))}
        </div>
      )}

      {c.members.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 sm:left-52 z-20 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700/60 px-6 py-3">
          <div className="max-w-2xl mx-auto">
            <EvaluationFooterBar
              isClosed={c.isClosed}
              closedAt={c.closureStatus?.closedAt}
              totalMembers={c.members.length}
              confirmedCount={c.confirmedCount}
              unconfirmedCount={c.unconfirmedCount}
              allConfirmed={c.allConfirmed}
              showCloseWarning={c.showCloseWarning}
              onShowCloseWarning={() => c.setShowCloseWarning(true)}
              onCancelCloseWarning={() => c.setShowCloseWarning(false)}
              onCloseCompetencia={() => c.closeMutation.mutate()}
              isClosePending={c.closeMutation.isPending}
              onReopenCiclo={() => c.reopenCicloMutation.mutate()}
              isReopenCicloPending={c.reopenCicloMutation.isPending}
              onOpenPdf={() => c.setPdfModalOpen(true)}
            />
          </div>
        </div>
      )}

      {c.selectedMember && (
        <EvaluationDrawer
          member={c.selectedMember}
          competencia={c.competencia}
          isClosed={c.isClosed}
          confirmedEval={c.selectedMemberEval}
          chat={c.currentChat}
          userInput={c.userInput}
          isSending={c.chatMutation.isPending}
          isConfirming={c.confirmMutation.isPending}
          onInput={c.setUserInput}
          onSend={c.handleSend}
          onUpdateProposal={(patch) => c.updateProposal(c.selectedMemberId!, patch)}
          onConfirm={() =>
            c.currentChat.proposal && c.confirmMutation.mutate(c.currentChat.proposal)
          }
          onReopenEvaluation={() => c.handleReopenEvaluation(c.selectedMemberId!)}
          onClose={() => c.setSelectedMemberId(null)}
        />
      )}

      {c.pdfModalOpen && (
        <PdfPreviewModal
          squadName={squadName}
          competencia={c.competencia}
          closedAt={c.closureStatus?.closedAt}
          evaluations={c.confirmedEvals}
          isDownloading={c.downloadMutation.isPending}
          onDownload={() => c.downloadMutation.mutate()}
          onClose={() => c.setPdfModalOpen(false)}
        />
      )}
    </div>
  )
}
