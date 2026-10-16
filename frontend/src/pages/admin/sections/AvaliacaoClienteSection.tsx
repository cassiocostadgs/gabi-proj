import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Star,
  AlertTriangle,
  X,
  CheckCircle,
  XCircle,
  Lock,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Trash2,
} from 'lucide-react'
import { Spinner } from '../../../components/Spinner'
import { SelectField } from '../../../components/ui/select'
import { EvaluationRosterCard } from '../../../components/evaluation/EvaluationRosterCard'
import { clientEvaluationService } from '../../../services/client-evaluation.service'
import { billingService } from '../../../services/billing.service'
import { competenciaLabel, competenciaShort, fmtDatetime } from '../../../lib/format'
import { scoreBand, SCORE_BAND_BADGE_CLS } from '../../../lib/evaluationScore'
import { RANGE_OPTIONS, type RangeFilter } from '../../../lib/evaluationRange'
import axios from 'axios'
import type {
  ClientEvaluation,
  ClientEvaluationDashboard,
  ClientEvaluationDraft,
  EvaluationStatus,
  TeamMember,
} from '../../../types'

const UNSET_EMAIL = '__null__'

const STATUS_LABEL: Record<EvaluationStatus, string> = {
  rascunho: 'Rascunho',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
}

const STATUS_CLS: Record<EvaluationStatus, string> = {
  rascunho: 'bg-slate-500/10 border-slate-500/30 text-slate-400',
  aprovado: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  rejeitado: 'bg-red-500/10 border-red-500/30 text-red-400',
}

const STATUS_FILTER_OPTIONS: Array<{ value: '' | EvaluationStatus; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'rejeitado', label: 'Rejeitado' },
]

function emailToDisplayName(email: string): string {
  const prefix = email.split('@')[0] ?? email
  return prefix
    .split('.')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

// Prefers the registered full name — falls back to the e-mail-derived guess only for
// legacy members whose nome_completo hasn't been backfilled yet.
function memberDisplayName(member: TeamMember): string {
  return member.nome_completo || emailToDisplayName(member.user_email)
}

function ScorePill({ score }: Readonly<{ score: number }>) {
  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-[0.65rem] font-bold ${SCORE_BAND_BADGE_CLS[scoreBand(score)]}`}
    >
      {score}
    </span>
  )
}

function RejectedFooter({
  onConfirmDelete,
  isDeletePending,
}: Readonly<{ onConfirmDelete: () => void; isDeletePending: boolean }>) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (!confirmOpen) {
    return (
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-slate-500">
          Registro rejeitado. Exclua para lançar a avaliação corrigida deste profissional.
        </p>
        <button
          onClick={() => setConfirmOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 transition-colors"
        >
          <Trash2 size={13} /> Excluir
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-xs text-amber-300">
        Excluir definitivamente este registro? Esta ação é irreversível.
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => setConfirmOpen(false)}
          className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirmDelete}
          disabled={isDeletePending}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white transition-colors"
        >
          {isDeletePending ? <Spinner size="sm" /> : <Trash2 size={13} />}
          Confirmar exclusão
        </button>
      </div>
    </div>
  )
}

interface ReviewDrawerFooterProps {
  isRejeitado: boolean
  isAprovado: boolean
  canApprove: boolean
  rejectConfirmOpen: boolean
  onRequestReject: () => void
  onCancelReject: () => void
  onConfirmReject: () => void
  isRejectPending: boolean
  onSave: () => void
  isSavePending: boolean
  onApprove: () => void
  isApprovePending: boolean
  onConfirmDelete: () => void
  isDeletePending: boolean
}

function ReviewDrawerFooter({
  isRejeitado,
  isAprovado,
  canApprove,
  rejectConfirmOpen,
  onRequestReject,
  onCancelReject,
  onConfirmReject,
  isRejectPending,
  onSave,
  isSavePending,
  onApprove,
  isApprovePending,
  onConfirmDelete,
  isDeletePending,
}: Readonly<ReviewDrawerFooterProps>) {
  if (isRejeitado) {
    return <RejectedFooter onConfirmDelete={onConfirmDelete} isDeletePending={isDeletePending} />
  }

  if (rejectConfirmOpen) {
    return (
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-amber-300">Tem certeza? Esta ação é irreversível.</p>
        <div className="flex gap-2">
          <button
            onClick={onCancelReject}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmReject}
            disabled={isRejectPending}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white transition-colors"
          >
            {isRejectPending ? <Spinner size="sm" /> : <XCircle size={13} />}
            Confirmar rejeição
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <button
        onClick={onRequestReject}
        disabled={isAprovado}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <XCircle size={13} /> Rejeitar
      </button>
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={isAprovado || isSavePending}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isSavePending ? <Spinner size="sm" /> : null}
          Salvar
        </button>
        <div className="relative group">
          <button
            onClick={onApprove}
            disabled={isAprovado || !canApprove || isApprovePending}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
          >
            {isApprovePending ? <Spinner size="sm" /> : <CheckCircle size={13} />}
            Aprovar
          </button>
          {!canApprove && !isAprovado && (
            <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-slate-700 text-slate-200 text-[0.65rem] rounded whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
              Vincule o profissional antes de aprovar
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface ReviewDrawerProps {
  evaluationId: number
  nomeSummary: string
  competencia: string
  onClose: () => void
  onActionDone: () => void
}

function ReviewDrawer({
  evaluationId,
  nomeSummary,
  competencia,
  onClose,
  onActionDone,
}: Readonly<ReviewDrawerProps>) {
  const qc = useQueryClient()

  const { data: evaluation, isLoading } = useQuery({
    queryKey: ['client-evaluation', evaluationId],
    queryFn: () => clientEvaluationService.getEvaluation(evaluationId),
    staleTime: 0,
  })

  const { data: allMembers = [] } = useQuery({
    queryKey: ['admin-team'],
    queryFn: billingService.listTeam,
  })

  // Inactive members stay selectable — a departed collaborator must still be linkable to
  // evaluations from when they were active — but sort after actives, each group by name.
  const sortedMembers = [...allMembers].sort((a: TeamMember, b: TeamMember) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
    return memberDisplayName(a).localeCompare(memberDisplayName(b))
  })

  const [draftUserEmail, setDraftUserEmail] = useState<string | null>(null)
  const [draftComportamentalNota, setDraftComportamentalNota] = useState<number | null>(null)
  const [draftComportamentalComentario, setDraftComportamentalComentario] = useState<string | null>(
    null
  )
  const [draftTecnicaNota, setDraftTecnicaNota] = useState<number | null>(null)
  const [draftTecnicaComentario, setDraftTecnicaComentario] = useState<string | null>(null)
  const [draftPrazoNota, setDraftPrazoNota] = useState<number | null>(null)
  const [draftPrazoComentario, setDraftPrazoComentario] = useState<string | null>(null)
  const [draftComentarioGeral, setDraftComentarioGeral] = useState<string | null>(null)
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false)

  useEffect(() => {
    if (!evaluation) return
    setDraftUserEmail(evaluation.user_email)
    setDraftComportamentalNota(evaluation.comportamental_nota)
    setDraftComportamentalComentario(evaluation.comportamental_comentario)
    setDraftTecnicaNota(evaluation.tecnica_nota)
    setDraftTecnicaComentario(evaluation.tecnica_comentario)
    setDraftPrazoNota(evaluation.prazo_nota)
    setDraftPrazoComentario(evaluation.prazo_comentario)
    setDraftComentarioGeral(evaluation.comentario_geral)
  }, [evaluation])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    globalThis.addEventListener('keydown', handler)
    return () => globalThis.removeEventListener('keydown', handler)
  }, [onClose])

  const saveMutation = useMutation({
    mutationFn: () => {
      const draft: ClientEvaluationDraft = {
        user_email: draftUserEmail,
        comportamental_nota: draftComportamentalNota,
        comportamental_comentario: draftComportamentalComentario,
        tecnica_nota: draftTecnicaNota,
        tecnica_comentario: draftTecnicaComentario,
        prazo_nota: draftPrazoNota,
        prazo_comentario: draftPrazoComentario,
        comentario_geral: draftComentarioGeral,
      }
      return clientEvaluationService.updateEvaluation(evaluationId, draft)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-evaluation', evaluationId] })
      onActionDone()
    },
  })

  const approveMutation = useMutation({
    mutationFn: () => clientEvaluationService.approveEvaluation(evaluationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-evaluation', evaluationId] })
      onActionDone()
    },
  })

  const rejectMutation = useMutation({
    mutationFn: () => clientEvaluationService.rejectEvaluation(evaluationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-evaluation', evaluationId] })
      onActionDone()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => clientEvaluationService.deleteEvaluation(evaluationId),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['client-evaluation', evaluationId] })
      onActionDone()
    },
  })

  const isAprovado = evaluation?.status === 'aprovado'
  const isRejeitado = evaluation?.status === 'rejeitado'
  const isLocked = isAprovado || isRejeitado
  const canApprove = draftUserEmail != null
  const showPerDimensionComments = draftComentarioGeral == null

  const memberOptions = [
    { value: UNSET_EMAIL, label: '— Selecionar profissional —' },
    ...sortedMembers.map((m: TeamMember) => ({
      value: m.user_email,
      label: m.is_active ? memberDisplayName(m) : `${memberDisplayName(m)} (Inativo)`,
    })),
  ]

  return (
    <>
      <button
        type="button"
        aria-label="Fechar"
        className="fixed inset-0 bg-black/50 z-40 cursor-default"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 h-full w-full max-w-4xl bg-slate-900 border-l border-slate-700 z-50 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
          <p className="font-semibold text-slate-100 text-sm truncate">
            Revisão — {nomeSummary} / {competencia}
          </p>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex min-h-0">
          {isLoading && (
            <div className="flex-1 flex items-center justify-center">
              <Spinner />
            </div>
          )}
          {!isLoading && evaluation && (
            <>
              <div className="w-1/2 border-r border-slate-700 flex flex-col overflow-hidden">
                <p className="px-4 py-2 text-[0.65rem] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-800 shrink-0">
                  Texto original
                </p>
                <pre className="flex-1 overflow-y-auto px-4 py-3 text-xs text-slate-300 font-mono bg-slate-950 whitespace-pre-wrap break-words">
                  {evaluation.raw_email_text}
                </pre>
              </div>

              <div className="w-1/2 overflow-y-auto px-5 py-4 space-y-4">
                {isAprovado && (
                  <div className="flex items-start gap-2.5 bg-emerald-950/50 border border-emerald-800/50 rounded-xl px-4 py-3">
                    <Lock size={13} className="text-emerald-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-emerald-300">
                        Registro aprovado — imutável
                      </p>
                      <p className="text-[0.7rem] text-emerald-700 mt-0.5">
                        Aprovado em {fmtDatetime(evaluation.reviewed_at ?? '')} por{' '}
                        {evaluation.reviewed_by ?? '—'}
                      </p>
                    </div>
                  </div>
                )}

                {isRejeitado && (
                  <div className="flex items-start gap-2.5 bg-red-950/50 border border-red-800/50 rounded-xl px-4 py-3">
                    <XCircle size={13} className="text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-red-300">
                        Registro rejeitado — somente leitura
                      </p>
                      <p className="text-[0.7rem] text-red-700 mt-0.5">
                        Rejeitado em {fmtDatetime(evaluation.reviewed_at ?? '')} por{' '}
                        {evaluation.reviewed_by ?? '—'}
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="ce-user-email"
                    className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
                  >
                    Profissional
                    {evaluation.match_status === 'nao_vinculado' && (
                      <AlertTriangle size={11} className="inline ml-1.5 text-amber-400" />
                    )}
                  </label>
                  <SelectField
                    id="ce-user-email"
                    value={draftUserEmail ?? UNSET_EMAIL}
                    onValueChange={(val) => setDraftUserEmail(val === UNSET_EMAIL ? null : val)}
                    options={memberOptions}
                    disabled={isLocked}
                  />
                </div>

                <div>
                  <p className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                    Competência
                  </p>
                  <p className="text-sm text-slate-300">{evaluation.competencia}</p>
                </div>

                <div>
                  <label
                    htmlFor="ce-comp-nota"
                    className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
                  >
                    Nota Comportamental
                  </label>
                  <input
                    id="ce-comp-nota"
                    type="number"
                    min={1}
                    max={5}
                    value={draftComportamentalNota ?? ''}
                    onChange={(e) =>
                      setDraftComportamentalNota(e.target.value ? Number(e.target.value) : null)
                    }
                    disabled={isLocked}
                    className="w-24 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
                  />
                </div>

                {showPerDimensionComments && (
                  <div>
                    <label
                      htmlFor="ce-comp-comentario"
                      className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
                    >
                      Comentário Comportamental
                    </label>
                    <textarea
                      id="ce-comp-comentario"
                      value={draftComportamentalComentario ?? ''}
                      onChange={(e) => setDraftComportamentalComentario(e.target.value || null)}
                      disabled={isLocked}
                      rows={2}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-blue-500 transition-colors resize-y disabled:opacity-50"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="ce-tec-nota"
                    className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
                  >
                    Nota Técnica
                  </label>
                  <input
                    id="ce-tec-nota"
                    type="number"
                    min={1}
                    max={5}
                    value={draftTecnicaNota ?? ''}
                    onChange={(e) =>
                      setDraftTecnicaNota(e.target.value ? Number(e.target.value) : null)
                    }
                    disabled={isLocked}
                    className="w-24 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
                  />
                </div>

                {showPerDimensionComments && (
                  <div>
                    <label
                      htmlFor="ce-tec-comentario"
                      className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
                    >
                      Comentário Técnico
                    </label>
                    <textarea
                      id="ce-tec-comentario"
                      value={draftTecnicaComentario ?? ''}
                      onChange={(e) => setDraftTecnicaComentario(e.target.value || null)}
                      disabled={isLocked}
                      rows={2}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-blue-500 transition-colors resize-y disabled:opacity-50"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="ce-prazo-nota"
                    className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
                  >
                    Nota Prazo
                  </label>
                  <input
                    id="ce-prazo-nota"
                    type="number"
                    min={1}
                    max={5}
                    value={draftPrazoNota ?? ''}
                    onChange={(e) =>
                      setDraftPrazoNota(e.target.value ? Number(e.target.value) : null)
                    }
                    disabled={isLocked}
                    className="w-24 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
                  />
                </div>

                {showPerDimensionComments && (
                  <div>
                    <label
                      htmlFor="ce-prazo-comentario"
                      className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
                    >
                      Comentário Prazo
                    </label>
                    <textarea
                      id="ce-prazo-comentario"
                      value={draftPrazoComentario ?? ''}
                      onChange={(e) => setDraftPrazoComentario(e.target.value || null)}
                      disabled={isLocked}
                      rows={2}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-blue-500 transition-colors resize-y disabled:opacity-50"
                    />
                  </div>
                )}

                {!showPerDimensionComments && (
                  <div>
                    <label
                      htmlFor="ce-comentario-geral"
                      className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
                    >
                      Feedback Geral
                    </label>
                    <textarea
                      id="ce-comentario-geral"
                      value={draftComentarioGeral ?? ''}
                      onChange={(e) => setDraftComentarioGeral(e.target.value || null)}
                      disabled={isLocked}
                      rows={3}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-blue-500 transition-colors resize-y disabled:opacity-50"
                    />
                  </div>
                )}

                <div className="text-[0.65rem] text-slate-600 space-y-0.5">
                  <p>
                    Criado por {evaluation.created_by} em {fmtDatetime(evaluation.created_at)}
                  </p>
                  {evaluation.edited_by && (
                    <p>
                      Editado por {evaluation.edited_by} em{' '}
                      {fmtDatetime(evaluation.edited_at ?? '')}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {evaluation && (
          <div className="border-t border-slate-700 px-5 py-4 shrink-0">
            <ReviewDrawerFooter
              isRejeitado={isRejeitado}
              isAprovado={isAprovado}
              canApprove={canApprove}
              rejectConfirmOpen={rejectConfirmOpen}
              onRequestReject={() => setRejectConfirmOpen(true)}
              onCancelReject={() => setRejectConfirmOpen(false)}
              onConfirmReject={() => rejectMutation.mutate()}
              isRejectPending={rejectMutation.isPending}
              onSave={() => saveMutation.mutate()}
              isSavePending={saveMutation.isPending}
              onApprove={() => approveMutation.mutate()}
              isApprovePending={approveMutation.isPending}
              onConfirmDelete={() => deleteMutation.mutate()}
              isDeletePending={deleteMutation.isPending}
            />
          </div>
        )}
      </div>
    </>
  )
}

interface RosterPerson {
  key: string
  name: string
  history: ClientEvaluationDashboard[] // ascending by competência
}

interface IngestReviewTabProps {
  onOpenEvaluation: (evaluation: ClientEvaluation) => void
}

function IngestReviewTab({ onOpenEvaluation }: Readonly<IngestReviewTabProps>) {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<'' | EvaluationStatus>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedComp, setSelectedComp] = useState<string | null>(null)
  const [ingestOpen, setIngestOpen] = useState(false)
  const [emailBody, setEmailBody] = useState('')
  const [ingestErrorType, setIngestErrorType] = useState<'parse' | 'duplicate' | 'override' | null>(
    null
  )
  const [ingestErrorMessage, setIngestErrorMessage] = useState('')
  const [reprocessMessage, setReprocessMessage] = useState('')

  const { data: evaluations = [], isLoading } = useQuery({
    queryKey: ['client-evaluations'],
    queryFn: () => clientEvaluationService.listEvaluations(),
  })

  const unlinkedCount = evaluations.filter(
    (e) => e.match_status === 'nao_vinculado' && e.status === 'rascunho'
  ).length

  const reprocessMutation = useMutation({
    mutationFn: () => clientEvaluationService.reprocessUnlinked(),
    onSuccess: ({ relinked }) => {
      if (relinked > 0) {
        const suffix = relinked === 1 ? '' : 's'
        setReprocessMessage(`${relinked} registro${suffix} vinculado${suffix} com sucesso.`)
      } else {
        setReprocessMessage('Nenhum registro pôde ser vinculado com o cadastro atual.')
      }
      qc.invalidateQueries({ queryKey: ['client-evaluations'] })
    },
  })

  const competencias = useMemo(
    () => [...new Set(evaluations.map((e) => e.competencia))].sort((a, b) => a.localeCompare(b)),
    [evaluations]
  )

  useEffect(() => {
    if (competencias.length === 0) return
    if (selectedComp === null || !competencias.includes(selectedComp)) {
      setSelectedComp(competencias[competencias.length - 1])
    }
  }, [competencias, selectedComp])

  const pendingCompetencias = useMemo(() => {
    const set = new Set<string>()
    evaluations.forEach((e) => {
      if (e.status === 'rascunho') set.add(e.competencia)
    })
    return set
  }, [evaluations])

  const compIdx = selectedComp ? competencias.indexOf(selectedComp) : -1

  const compItems = useMemo(
    () => evaluations.filter((e) => e.competencia === selectedComp),
    [evaluations, selectedComp]
  )

  const reviewedCount = compItems.filter((e) => e.status !== 'rascunho').length
  const totalCount = compItems.length

  const filteredItems = compItems.filter((e) => {
    if (statusFilter && e.status !== statusFilter) return false
    if (searchTerm && !e.nome_extraido.toLowerCase().includes(searchTerm.toLowerCase()))
      return false
    return true
  })

  const ingestMutation = useMutation({
    mutationFn: ({ body, confirmOverride }: { body: string; confirmOverride?: boolean }) =>
      clientEvaluationService.ingest(body, confirmOverride),
    onSuccess: () => {
      setEmailBody('')
      setIngestErrorType(null)
      setIngestErrorMessage('')
      qc.invalidateQueries({ queryKey: ['client-evaluations'] })
    },
    onError: (err: unknown) => {
      if (!axios.isAxiosError(err)) return
      const status = err.response?.status
      const detail = (err.response?.data?.detail as string | undefined) ?? 'Erro desconhecido.'
      const requiresOverride =
        (err.response?.data?.requires_override as boolean | undefined) ?? false
      if (status === 422) {
        setIngestErrorType('parse')
      } else if (status === 409) {
        setIngestErrorType(requiresOverride ? 'override' : 'duplicate')
      }
      setIngestErrorMessage(detail)
    },
  })

  function handleIngest() {
    setIngestErrorType(null)
    setIngestErrorMessage('')
    ingestMutation.mutate({ body: emailBody })
  }

  function handleOverrideConfirm() {
    ingestMutation.mutate({ body: emailBody, confirmOverride: true })
  }

  return (
    <>
      {competencias.length > 0 && (
        <div className="sticky top-[57px] sm:top-0 z-10 bg-slate-900 pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => setSelectedComp(competencias[compIdx - 1] ?? null)}
              disabled={compIdx <= 0}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-25"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex-1 text-center">
              <p className="text-sm font-semibold text-slate-200">
                {selectedComp ? competenciaLabel(selectedComp) : '—'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {totalCount} avaliaç{totalCount === 1 ? 'ão' : 'ões'} recebida
                {totalCount === 1 ? '' : 's'}
              </p>
            </div>
            <button
              onClick={() => setSelectedComp(competencias[compIdx + 1] ?? null)}
              disabled={compIdx >= competencias.length - 1}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-25"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="flex gap-1 justify-center mb-3">
            {competencias.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedComp(c)}
                className={`relative px-2 py-0.5 rounded text-xs font-medium transition-colors border ${
                  selectedComp === c
                    ? 'bg-blue-700/20 text-blue-300 border-blue-700/40'
                    : 'text-slate-600 border-transparent hover:text-slate-300 hover:border-slate-700'
                }`}
              >
                {competenciaShort(c)}
                {pendingCompetencias.has(c) && (
                  <span
                    title="Há avaliações pendentes de aprovação neste mês"
                    className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400"
                  />
                )}
              </button>
            ))}
          </div>
          <div className="px-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[0.65rem] font-semibold text-slate-500 uppercase tracking-wide">
                {reviewedCount} de {totalCount} revisadas
              </span>
              <span className="text-[0.65rem] text-slate-500">
                {totalCount > 0 ? Math.round((reviewedCount / totalCount) * 100) : 0}%
              </span>
            </div>
            <div className="w-full bg-slate-700/60 rounded-full h-1">
              <div
                className={`h-1 rounded-full transition-all ${
                  totalCount > 0 && reviewedCount === totalCount ? 'bg-emerald-500' : 'bg-blue-500'
                }`}
                style={{
                  width: totalCount > 0 ? `${(reviewedCount / totalCount) * 100}%` : '0%',
                }}
              />
            </div>
          </div>
        </div>
      )}
      {competencias.length === 0 && !isLoading && (
        <p className="text-sm text-slate-500 text-center py-8">Nenhuma avaliação recebida ainda.</p>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setIngestOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-slate-700 text-slate-300 hover:text-slate-100 text-xs font-semibold transition-colors"
        >
          {ingestOpen ? '− Recolher lançamento manual' : '+ Lançamento manual'}
        </button>
        {unlinkedCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setReprocessMessage('')
              reprocessMutation.mutate()
            }}
            disabled={reprocessMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-700/50 bg-amber-950/40 hover:bg-amber-900/40 text-amber-300 hover:text-amber-200 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {reprocessMutation.isPending ? <Spinner size="sm" /> : <AlertTriangle size={13} />}
            Reprocessar {unlinkedCount} não vinculado{unlinkedCount === 1 ? '' : 's'}
          </button>
        )}
        {reprocessMessage && <p className="text-xs text-slate-400">{reprocessMessage}</p>}
      </div>

      {ingestOpen && (
        <div className="mb-6 max-w-3xl">
          <textarea
            value={emailBody}
            onChange={(e) => {
              setEmailBody(e.target.value)
              setIngestErrorType(null)
            }}
            rows={10}
            placeholder="Cole aqui o corpo do e-mail de notificação da MAG..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-blue-500 transition-colors resize-y font-mono"
          />
          <div className="mt-3">
            <button
              type="button"
              onClick={handleIngest}
              disabled={!emailBody.trim() || ingestMutation.isPending}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors flex items-center gap-2"
            >
              {ingestMutation.isPending && <Spinner size="sm" />}
              Processar
            </button>
          </div>

          {ingestErrorType === 'parse' && (
            <div className="mt-3 bg-red-950/60 border border-red-700/50 rounded-xl px-4 py-3 text-xs text-red-300">
              <p className="font-semibold mb-1">Erro de parse</p>
              <p>{ingestErrorMessage}</p>
              <p className="text-red-500 mt-1">
                Texto original não foi salvo — corrija o e-mail e tente novamente.
              </p>
            </div>
          )}

          {ingestErrorType === 'duplicate' && (
            <div className="mt-3 bg-amber-950/60 border border-amber-700/50 rounded-xl px-4 py-3 text-xs text-amber-300">
              <p className="font-semibold mb-1">Registro duplicado</p>
              <p>{ingestErrorMessage}</p>
            </div>
          )}

          {ingestErrorType === 'override' && (
            <div className="mt-3 bg-amber-950/60 border border-amber-700/50 rounded-xl px-4 py-3 text-xs text-amber-300">
              <p className="font-semibold mb-1">Registro duplicado — já aprovado</p>
              <p className="mb-2">{ingestErrorMessage}</p>
              <button
                type="button"
                onClick={handleOverrideConfirm}
                disabled={ingestMutation.isPending}
                className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition-colors"
              >
                Criar novo rascunho mesmo assim
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1">
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                statusFilter === opt.value
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar profissional..."
          className="w-56 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      )}
      {!isLoading && evaluations.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-8">
          Nenhuma avaliação processada ainda. Use "Lançamento manual" para colar um e-mail.
        </p>
      )}
      {!isLoading && evaluations.length > 0 && filteredItems.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-8">
          Nenhuma avaliação encontrada para este filtro.
        </p>
      )}
      {!isLoading && filteredItems.length > 0 && (
        <div className="space-y-2">
          {filteredItems.map((ev) => (
            <button
              key={ev.id}
              type="button"
              onClick={() => onOpenEvaluation(ev)}
              className={`w-full text-left bg-slate-800/60 border border-slate-700 hover:border-slate-600 rounded-xl px-5 py-4 text-xs transition-colors group ${
                ev.status === 'rejeitado' ? 'opacity-60 hover:opacity-80' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  {ev.match_status === 'nao_vinculado' ? (
                    <p className="inline-flex items-center gap-1.5 text-amber-400 font-bold">
                      <AlertTriangle size={11} /> Não vinculado
                    </p>
                  ) : (
                    <p className="font-semibold text-slate-200 truncate">{ev.nome_extraido}</p>
                  )}
                  <p className="text-slate-500 mt-0.5 truncate">
                    {fmtDatetime(ev.created_at)} ·{' '}
                    {ev.origem === 'automacao' ? 'Automação' : 'Manual'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex gap-1.5">
                    {ev.comportamental_nota != null && <ScorePill score={ev.comportamental_nota} />}
                    {ev.tecnica_nota != null && <ScorePill score={ev.tecnica_nota} />}
                    {ev.prazo_nota != null && <ScorePill score={ev.prazo_nota} />}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full border text-[0.65rem] font-bold ${STATUS_CLS[ev.status]}`}
                  >
                    {STATUS_LABEL[ev.status]}
                  </span>
                  <ChevronsRight
                    size={14}
                    className="text-slate-600 group-hover:text-slate-400 transition-colors"
                  />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function DashboardTab() {
  const [dashSearch, setDashSearch] = useState('')
  const [dashRange, setDashRange] = useState<RangeFilter>('12')

  const { data: dashboardData = [], isLoading: dashLoading } = useQuery({
    queryKey: ['client-evaluations-dashboard'],
    queryFn: () => clientEvaluationService.getDashboard({}),
    staleTime: 30_000,
  })

  const roster = useMemo<RosterPerson[]>(() => {
    const byEmail = new Map<string, ClientEvaluationDashboard[]>()
    dashboardData.forEach((rec) => {
      const list = byEmail.get(rec.user_email) ?? []
      list.push(rec)
      byEmail.set(rec.user_email, list)
    })
    return [...byEmail.entries()]
      .map(([email, records]) => {
        const sorted = [...records].sort((a, b) => a.competencia.localeCompare(b.competencia))
        return { key: email, name: sorted[sorted.length - 1].nome_extraido, history: sorted }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [dashboardData])

  const filteredRoster = useMemo(
    () =>
      roster.filter((p) => !dashSearch || p.name.toLowerCase().includes(dashSearch.toLowerCase())),
    [roster, dashSearch]
  )

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <input
          type="text"
          value={dashSearch}
          onChange={(e) => setDashSearch(e.target.value)}
          placeholder="Buscar profissional..."
          className="w-56 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-blue-500 transition-colors"
        />
        <div className="flex gap-1 bg-slate-800/50 border border-slate-700 rounded-lg p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDashRange(opt.value)}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors ${
                dashRange === opt.value
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {dashLoading && (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      )}
      {!dashLoading && roster.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <BarChart2 size={32} className="text-slate-700" />
          <p className="text-sm text-slate-500">Nenhuma avaliação aprovada disponível ainda.</p>
        </div>
      )}
      {!dashLoading && roster.length > 0 && (
        <div className="space-y-2">
          {filteredRoster.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">
              Nenhum profissional encontrado.
            </p>
          )}
          {filteredRoster.map((person, index) => (
            <EvaluationRosterCard
              key={person.key}
              person={person}
              range={dashRange}
              defaultOpen={index === 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function AvaliacaoClienteSection() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'ingest' | 'dashboard'>('ingest')
  const [openEvaluation, setOpenEvaluation] = useState<ClientEvaluation | null>(null)

  return (
    <section className="pb-20">
      <div className="flex items-center gap-2 mb-4">
        <Star size={16} className="text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
          Avaliações — Cliente MAG
        </h2>
      </div>

      <div className="flex gap-1 mb-6 bg-slate-800/50 rounded-lg p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('ingest')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'ingest'
              ? 'bg-slate-700 text-slate-100'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Ingestão / Revisão
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'dashboard'
              ? 'bg-slate-700 text-slate-100'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Dashboard
        </button>
      </div>

      {activeTab === 'ingest' && <IngestReviewTab onOpenEvaluation={setOpenEvaluation} />}
      {activeTab === 'dashboard' && <DashboardTab />}

      {openEvaluation && (
        <ReviewDrawer
          evaluationId={openEvaluation.id}
          nomeSummary={openEvaluation.nome_extraido}
          competencia={openEvaluation.competencia}
          onClose={() => setOpenEvaluation(null)}
          onActionDone={() => {
            qc.invalidateQueries({ queryKey: ['client-evaluations'] })
            setOpenEvaluation(null)
          }}
        />
      )}
    </section>
  )
}
