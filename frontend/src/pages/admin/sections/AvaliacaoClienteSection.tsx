import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Star, AlertTriangle, X, CheckCircle, XCircle, Lock, BarChart2 } from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { Spinner } from '../../../components/Spinner'
import { SelectField } from '../../../components/ui/select'
import { clientEvaluationService } from '../../../services/client-evaluation.service'
import { billingService } from '../../../services/billing.service'
import { competenciaShort, fmtDatetime } from '../../../lib/format'
import axios from 'axios'
import type {
  ClientEvaluation,
  ClientEvaluationDashboard,
  ClientEvaluationDraft,
  EvaluationStatus,
  TeamMember,
} from '../../../types'

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Legend
)

const UNSET_EMAIL = '__null__'

const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' as const, labels: { color: '#94a3b8' } },
  },
  scales: {
    x: {
      grid: { color: '#1e293b' },
      ticks: { color: '#94a3b8' },
    },
    y: {
      min: 1,
      max: 5,
      grid: { color: '#1e293b' },
      ticks: { color: '#94a3b8', stepSize: 1 },
      title: { display: true, text: 'Nota', color: '#94a3b8' },
    },
  },
}

function formatDashComment(rec: ClientEvaluationDashboard): string {
  if (rec.comentario_geral) return rec.comentario_geral
  return [rec.comportamental_comentario, rec.tecnica_comentario, rec.prazo_comentario]
    .filter(Boolean)
    .join(' / ')
}

type DimensionField = 'comportamental_nota' | 'tecnica_nota' | 'prazo_nota'

function averageForCompetencia(
  dashboardData: ClientEvaluationDashboard[],
  competencia: string,
  field: DimensionField
): number | null {
  const vals = dashboardData
    .filter((r) => r.competencia === competencia && r[field] != null)
    .map((r) => r[field] as number)
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

function averageByField(
  dashboardData: ClientEvaluationDashboard[],
  competencias: string[],
  field: DimensionField
): (number | null)[] {
  return competencias.map((comp) => averageForCompetencia(dashboardData, comp, field))
}

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

function emailToDisplayName(email: string): string {
  const prefix = email.split('@')[0] ?? email
  return prefix
    .split('.')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

function ScorePill({ score }: Readonly<{ score: number }>) {
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-700 text-slate-200 text-[0.65rem] font-bold">
      {score}
    </span>
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

  const activeMembers = allMembers
    .filter((m: TeamMember) => m.is_active)
    .sort((a: TeamMember, b: TeamMember) =>
      emailToDisplayName(a.user_email).localeCompare(emailToDisplayName(b.user_email))
    )

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

  const isAprovado = evaluation?.status === 'aprovado'
  const canApprove = draftUserEmail != null
  const showPerDimensionComments = draftComentarioGeral == null

  const memberOptions = [
    { value: UNSET_EMAIL, label: '— Selecionar profissional —' },
    ...activeMembers.map((m: TeamMember) => ({
      value: m.user_email,
      label: emailToDisplayName(m.user_email),
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
                    disabled={isAprovado}
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
                    disabled={isAprovado}
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
                      disabled={isAprovado}
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
                    disabled={isAprovado}
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
                      disabled={isAprovado}
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
                    disabled={isAprovado}
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
                      disabled={isAprovado}
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
                      disabled={isAprovado}
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
            {rejectConfirmOpen ? (
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-amber-300">Tem certeza? Esta ação é irreversível.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRejectConfirmOpen(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => rejectMutation.mutate()}
                    disabled={rejectMutation.isPending}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white transition-colors"
                  >
                    {rejectMutation.isPending ? <Spinner size="sm" /> : <XCircle size={13} />}
                    Confirmar rejeição
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setRejectConfirmOpen(true)}
                  disabled={isAprovado}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <XCircle size={13} /> Rejeitar
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => saveMutation.mutate()}
                    disabled={isAprovado || saveMutation.isPending}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {saveMutation.isPending ? <Spinner size="sm" /> : null}
                    Salvar
                  </button>
                  <div className="relative group">
                    <button
                      onClick={() => approveMutation.mutate()}
                      disabled={isAprovado || !canApprove || approveMutation.isPending}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
                    >
                      {approveMutation.isPending ? (
                        <Spinner size="sm" />
                      ) : (
                        <CheckCircle size={13} />
                      )}
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
            )}
          </div>
        )}
      </div>
    </>
  )
}

export function AvaliacaoClienteSection() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'ingest' | 'dashboard'>('ingest')
  const [statusFilter, setStatusFilter] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [ingestErrorType, setIngestErrorType] = useState<'parse' | 'duplicate' | 'override' | null>(
    null
  )
  const [ingestErrorMessage, setIngestErrorMessage] = useState('')
  const [openEvaluation, setOpenEvaluation] = useState<ClientEvaluation | null>(null)

  // Dashboard filter state
  const [dashFilterEmail, setDashFilterEmail] = useState('')
  const [dashFilterFrom, setDashFilterFrom] = useState('')
  const [dashFilterTo, setDashFilterTo] = useState('')
  const [appliedDashFilters, setAppliedDashFilters] = useState({ email: '', from: '', to: '' })

  const { data: evaluations = [], isLoading } = useQuery({
    queryKey: ['client-evaluations', statusFilter],
    queryFn: () => clientEvaluationService.listEvaluations(statusFilter || undefined),
  })

  const { data: allTeamMembers = [] } = useQuery({
    queryKey: ['admin-team'],
    queryFn: billingService.listTeam,
  })

  const activeTeamMembers = allTeamMembers
    .filter((m) => m.is_active)
    .sort((a, b) =>
      emailToDisplayName(a.user_email).localeCompare(emailToDisplayName(b.user_email))
    )

  const { data: dashboardData = [], isLoading: dashLoading } = useQuery({
    queryKey: ['client-evaluations-dashboard', appliedDashFilters],
    queryFn: () =>
      clientEvaluationService.getDashboard({
        userEmail: appliedDashFilters.email || undefined,
        competenciaFrom: appliedDashFilters.from || undefined,
        competenciaTo: appliedDashFilters.to || undefined,
      }),
    enabled: activeTab === 'dashboard',
    staleTime: 30_000,
  })

  function handleApplyDashboard() {
    setAppliedDashFilters({ email: dashFilterEmail, from: dashFilterFrom, to: dashFilterTo })
  }

  const competenciasSorted = useMemo(
    () => [...new Set(dashboardData.map((r) => r.competencia))].sort((a, b) => a.localeCompare(b)),
    [dashboardData]
  )

  const chartData = useMemo(() => {
    const labels = competenciasSorted.map((c) => competenciaShort(c))
    return {
      labels,
      datasets: [
        {
          label: 'Comportamental',
          data: averageByField(dashboardData, competenciasSorted, 'comportamental_nota'),
          borderColor: 'rgba(59,130,246,0.9)',
          backgroundColor: 'rgba(59,130,246,0.15)',
          pointBackgroundColor: 'rgba(59,130,246,0.9)',
          tension: 0.3,
          spanGaps: true,
        },
        {
          label: 'Técnica',
          data: averageByField(dashboardData, competenciasSorted, 'tecnica_nota'),
          borderColor: 'rgba(52,211,153,0.9)',
          backgroundColor: 'rgba(52,211,153,0.15)',
          pointBackgroundColor: 'rgba(52,211,153,0.9)',
          tension: 0.3,
          spanGaps: true,
        },
        {
          label: 'Prazo',
          data: averageByField(dashboardData, competenciasSorted, 'prazo_nota'),
          borderColor: 'rgba(251,146,60,0.9)',
          backgroundColor: 'rgba(251,146,60,0.15)',
          pointBackgroundColor: 'rgba(251,146,60,0.9)',
          tension: 0.3,
          spanGaps: true,
        },
      ],
    }
  }, [dashboardData, competenciasSorted])

  const dashMemberOptions = [
    { value: '', label: 'Todos' },
    ...activeTeamMembers.map((m) => ({
      value: m.user_email,
      label: emailToDisplayName(m.user_email),
    })),
  ]

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

      {activeTab === 'ingest' && (
        <>
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

          <div className="mb-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500 transition-colors"
            >
              <option value="">Todos</option>
              <option value="rascunho">Rascunho</option>
              <option value="aprovado">Aprovado</option>
              <option value="rejeitado">Rejeitado</option>
            </select>
          </div>

          {isLoading && (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 bg-slate-800 rounded-xl animate-pulse" />
              ))}
            </div>
          )}
          {!isLoading && evaluations.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">
              Nenhuma avaliação processada ainda. Cole um e-mail acima para começar.
            </p>
          )}
          {!isLoading && evaluations.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b border-slate-700">
                    {[
                      'Status',
                      'Profissional',
                      'Competência',
                      'Comp.',
                      'Técn.',
                      'Prazo',
                      'Ações',
                    ].map((col) => (
                      <th
                        key={col}
                        className="pb-2 pr-4 last:pr-0 font-semibold text-slate-500 uppercase tracking-wide"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {evaluations.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 pr-4">
                        <span
                          className={`px-2 py-0.5 rounded-full border text-[0.65rem] font-bold ${STATUS_CLS[ev.status]}`}
                        >
                          {STATUS_LABEL[ev.status]}
                        </span>
                      </td>
                      <td className="py-3 pr-4 max-w-[160px]">
                        {ev.match_status === 'nao_vinculado' ? (
                          <span className="inline-flex items-center gap-1 text-amber-400">
                            <AlertTriangle size={11} />
                            <span className="text-[0.65rem] font-bold">Não vinculado</span>
                          </span>
                        ) : (
                          <span className="text-slate-300 truncate block">{ev.nome_extraido}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-slate-400">
                        {competenciaShort(ev.competencia)}
                      </td>
                      <td className="py-3 pr-4">
                        {ev.comportamental_nota != null && (
                          <ScorePill score={ev.comportamental_nota} />
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {ev.tecnica_nota != null && <ScorePill score={ev.tecnica_nota} />}
                      </td>
                      <td className="py-3 pr-4">
                        {ev.prazo_nota != null && <ScorePill score={ev.prazo_nota} />}
                      </td>
                      <td className="py-3">
                        {ev.status !== 'rejeitado' && (
                          <button
                            type="button"
                            onClick={() => setOpenEvaluation(ev)}
                            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium transition-colors"
                          >
                            Revisar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {activeTab === 'dashboard' && (
        <div>
          {/* Filter bar */}
          <div className="flex flex-wrap items-end gap-3 mb-6">
            <div>
              <label
                htmlFor="dash-filter-email"
                className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1"
              >
                Profissional
              </label>
              <SelectField
                id="dash-filter-email"
                value={dashFilterEmail}
                onValueChange={setDashFilterEmail}
                options={dashMemberOptions}
              />
            </div>
            <div>
              <label
                htmlFor="dash-filter-from"
                className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1"
              >
                Competência de
              </label>
              <input
                id="dash-filter-from"
                type="text"
                placeholder="YYYY-MM"
                value={dashFilterFrom}
                onChange={(e) => setDashFilterFrom(e.target.value)}
                className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label
                htmlFor="dash-filter-to"
                className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1"
              >
                Competência até
              </label>
              <input
                id="dash-filter-to"
                type="text"
                placeholder="YYYY-MM"
                value={dashFilterTo}
                onChange={(e) => setDashFilterTo(e.target.value)}
                className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <button
              type="button"
              onClick={handleApplyDashboard}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white font-semibold rounded-lg text-sm transition-colors"
            >
              Aplicar
            </button>
          </div>

          {/* Chart and table */}
          {dashLoading && (
            <div className="flex items-center justify-center py-20">
              <Spinner />
            </div>
          )}
          {!dashLoading && dashboardData.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <BarChart2 size={32} className="text-slate-700" />
              <p className="text-sm text-slate-500">
                Nenhum dado aprovado disponível para os filtros selecionados.
              </p>
            </div>
          )}
          {!dashLoading && dashboardData.length > 0 && (
            <>
              <div className="h-[300px] mb-8 bg-slate-800/30 rounded-xl p-4">
                <Line data={chartData} options={CHART_OPTIONS} />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left border-b border-slate-700">
                      {[
                        'Profissional',
                        'Competência',
                        'Comp.',
                        'Técnica',
                        'Prazo',
                        'Comentário',
                      ].map((col) => (
                        <th
                          key={col}
                          className="pb-2 pr-4 last:pr-0 font-semibold text-slate-500 uppercase tracking-wide"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {dashboardData.map((rec) => {
                      const comment = formatDashComment(rec)
                      return (
                        <tr
                          key={`${rec.user_email}-${rec.competencia}`}
                          className="hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="py-2 pr-4 text-slate-300">
                            {emailToDisplayName(rec.user_email)}
                          </td>
                          <td className="py-2 pr-4 text-slate-400">
                            {competenciaShort(rec.competencia)}
                          </td>
                          <td className="py-2 pr-4">
                            {rec.comportamental_nota != null && (
                              <ScorePill score={rec.comportamental_nota} />
                            )}
                          </td>
                          <td className="py-2 pr-4">
                            {rec.tecnica_nota != null && <ScorePill score={rec.tecnica_nota} />}
                          </td>
                          <td className="py-2 pr-4">
                            {rec.prazo_nota != null && <ScorePill score={rec.prazo_nota} />}
                          </td>
                          <td className="py-2 max-w-[220px]">
                            {comment && (
                              <span title={comment} className="text-slate-400 block truncate">
                                {comment.length > 80 ? comment.slice(0, 80) + '…' : comment}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

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
