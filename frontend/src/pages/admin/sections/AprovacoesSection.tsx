import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList,
  Download,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from 'lucide-react'
import { Spinner } from '../../../components/Spinner'
import { billingService } from '../../../services/billing.service'
import { validateService } from '../../../services/validate.service'
import { competenciaLabel, competenciaShort } from '../../../lib/format'
import { SubmissionDrawer } from './SubmissionDrawer'
import type { Submission, SubmissionStatus, MissingMember } from '../../../types'

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
}

const STATUS_CLS: Record<SubmissionStatus, string> = {
  pending: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  approved: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  rejected: 'bg-red-500/10 border-red-500/30 text-red-400',
}

interface ExportSectionProps {
  approvedCount: number
  totalMembers: number
  isComplete: boolean
  confirmExport: boolean
  onRequest: () => void
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}

function ExportSection({
  approvedCount,
  totalMembers,
  isComplete,
  confirmExport,
  onRequest,
  onConfirm,
  onCancel,
  isPending,
}: Readonly<ExportSectionProps>) {
  if (approvedCount === 0) return null
  if (confirmExport) {
    const missing = totalMembers - approvedCount
    return (
      <div className="bg-amber-950/40 border border-amber-700/40 rounded-xl px-5 py-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={14} className="text-amber-400 shrink-0" />
          <p className="text-xs font-semibold text-amber-400">
            {missing} membro{missing > 1 ? 's' : ''} ainda não aprovado{missing > 1 ? 's' : ''}
          </p>
        </div>
        <p className="text-xs text-slate-400 mb-3 pl-5">
          O faturamento será gerado somente com as {approvedCount} submissões aprovadas. Deseja
          continuar?
        </p>
        <div className="flex gap-2 pl-5">
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5"
          >
            {isPending ? <Spinner size="sm" /> : <Download size={12} />}
            Gerar assim mesmo
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }
  return (
    <button
      onClick={isComplete ? onConfirm : onRequest}
      disabled={isPending}
      className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors"
    >
      {isPending ? <Spinner size="sm" /> : <Download size={14} />}
      Gerar faturamento
    </button>
  )
}

export function AprovacoesSection() {
  const qc = useQueryClient()
  const [selectedComp, setSelectedComp] = useState<string | null>(null)
  const [confirmExport, setConfirmExport] = useState(false)
  const [openSubmission, setOpenSubmission] = useState<Submission | null>(null)

  const { data: oracleAvailable = false } = useQuery({
    queryKey: ['oracle-status'],
    queryFn: validateService.getOracleStatus,
    refetchInterval: 30_000,
  })

  const { data: summary } = useQuery({
    queryKey: ['admin-submissions-summary'],
    queryFn: billingService.getSummary,
  })

  const {
    data: submissions = [],
    isLoading: loadingSubs,
    refetch: refetchSubs,
  } = useQuery({
    queryKey: ['admin-submissions', selectedComp],
    queryFn: () => billingService.listSubmissions(selectedComp!),
    enabled: !!selectedComp,
  })

  const { data: missingMembers = [] } = useQuery({
    queryKey: ['admin-missing', selectedComp],
    queryFn: () => billingService.getMissingSubmissions(selectedComp!),
    enabled: !!selectedComp,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-submissions', selectedComp] })
    qc.invalidateQueries({ queryKey: ['admin-submissions-summary'] })
    qc.invalidateQueries({ queryKey: ['admin-missing', selectedComp] })
  }

  const exportMutation = useMutation({
    mutationFn: () => billingService.exportBilling(selectedComp!),
    onSuccess: () => setConfirmExport(false),
  })

  const compSummary = summary?.competencias.find((c) => c.competencia === selectedComp)
  const totalMembers = compSummary?.total_members ?? summary?.total_members ?? 0
  const submittedCount = compSummary?.total_submitted ?? 0
  const approvedCount = compSummary?.total_approved ?? 0
  const isComplete = approvedCount >= totalMembers && totalMembers > 0

  const competencias = useMemo(() => summary?.competencias ?? [], [summary])
  // Display oldest → newest (left → right); API returns newest-first
  const competenciasDisplay = [...competencias].reverse()
  const displayIdx = competenciasDisplay.findIndex((c) => c.competencia === selectedComp)

  useEffect(() => {
    if (competencias.length > 0 && selectedComp === null) {
      setSelectedComp(competencias[0].competencia)
    }
  }, [competencias, selectedComp])

  return (
    <section>
      <div className="sticky top-[84px] sm:top-7 z-10 bg-slate-900 pb-5">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList size={16} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Aprovações
          </h2>
          <div
            className={`ml-auto inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium ${
              oracleAvailable
                ? 'border-emerald-500/25 bg-emerald-500/6 text-slate-400'
                : 'border-amber-500/30 bg-amber-500/8 text-amber-400'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                oracleAvailable
                  ? 'bg-emerald-400 shadow-[0_0_0_2px_rgba(16,185,129,0.22)]'
                  : 'bg-amber-400 shadow-[0_0_0_2px_rgba(234,179,8,0.22)]'
              }`}
            />
            {oracleAvailable ? 'Task DB · conectado' : 'Task DB · indisponível'}
          </div>
        </div>

        {/* Competência selector */}
        {competencias.length > 0 ? (
          <div>
            {/* Primary: arrows + selected month */}
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() =>
                  setSelectedComp(competenciasDisplay[displayIdx - 1]?.competencia ?? null)
                }
                disabled={displayIdx <= 0}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-25"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="flex-1 text-center">
                <p className="text-sm font-semibold text-slate-200">
                  {selectedComp ? competenciaLabel(selectedComp) : '—'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {approvedCount} de {totalMembers} aprovados
                </p>
              </div>
              <button
                onClick={() =>
                  setSelectedComp(competenciasDisplay[displayIdx + 1]?.competencia ?? null)
                }
                disabled={displayIdx >= competenciasDisplay.length - 1}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-25"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            {/* Secondary: paginator pills */}
            <div className="flex gap-1 justify-center">
              {competenciasDisplay.map((c) => (
                <button
                  key={c.competencia}
                  onClick={() => setSelectedComp(c.competencia)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors border ${
                    selectedComp === c.competencia
                      ? 'bg-blue-700/20 text-blue-300 border-blue-700/40'
                      : 'text-slate-600 border-transparent hover:text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {competenciaShort(c.competencia)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500 py-6 text-center">
            Nenhuma submissão recebida ainda.
          </p>
        )}

        {selectedComp && (
          <div className="mt-4 px-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[0.65rem] font-semibold text-slate-500 uppercase tracking-wide">
                {submittedCount} de {totalMembers} submeteram
              </span>
              {missingMembers.length > 0 && (
                <span className="text-[0.65rem] text-slate-500">
                  {missingMembers.length} aguardando
                </span>
              )}
            </div>
            <div className="w-full bg-slate-700/60 rounded-full h-1">
              <div
                className={`h-1 rounded-full transition-all ${isComplete ? 'bg-emerald-500' : 'bg-blue-500'}`}
                style={{
                  width:
                    totalMembers > 0
                      ? `${Math.min(100, (submittedCount / totalMembers) * 100)}%`
                      : '0%',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {selectedComp && (
        <>
          {/* Submissions list */}
          {loadingSubs ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              {submissions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setOpenSubmission(s)}
                  className="w-full text-left bg-slate-800/60 border border-slate-700 hover:border-slate-600 rounded-xl px-5 py-4 text-xs transition-colors group"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-200 truncate">{s.nome_profissional}</p>
                      <p className="text-slate-500 mt-0.5 truncate">
                        {s.user_email} · {s.horas_task}h
                      </p>
                      {s.rejection_reason && (
                        <p className="text-red-400 mt-1">Motivo: {s.rejection_reason}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[0.65rem] font-bold ${STATUS_CLS[s.status]}`}
                      >
                        {STATUS_LABEL[s.status]}
                      </span>
                      <ChevronsRight
                        size={14}
                        className="text-slate-600 group-hover:text-slate-400 transition-colors"
                      />
                    </div>
                  </div>
                </button>
              ))}
              {submissions.length === 0 && missingMembers.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-6">
                  Nenhuma submissão para esta competência.
                </p>
              )}
              {missingMembers.map((m: MissingMember) => (
                <div
                  key={m.user_email}
                  className="w-full bg-slate-800/30 border border-slate-700/40 rounded-xl px-5 py-4 text-xs"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-slate-500 truncate">{m.user_email}</p>
                    <span className="px-2 py-0.5 rounded-full border text-[0.65rem] font-bold bg-slate-700/20 border-slate-600/30 text-slate-500 shrink-0">
                      Aguardando
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Export button */}
          <ExportSection
            approvedCount={approvedCount}
            totalMembers={totalMembers}
            isComplete={isComplete}
            confirmExport={confirmExport}
            onRequest={() => setConfirmExport(true)}
            onConfirm={() => exportMutation.mutate()}
            onCancel={() => setConfirmExport(false)}
            isPending={exportMutation.isPending}
          />
        </>
      )}

      {/* Submission drawer */}
      {openSubmission && (
        <SubmissionDrawer
          submission={openSubmission}
          onClose={() => setOpenSubmission(null)}
          onActionDone={() => {
            invalidate()
            refetchSubs()
          }}
        />
      )}
    </section>
  )
}
