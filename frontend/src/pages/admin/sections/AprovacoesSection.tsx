import { useState } from 'react'
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
import { competenciaLabel } from '../../../lib/format'
import { SubmissionDrawer } from './SubmissionDrawer'
import type { Submission, SubmissionStatus } from '../../../types'

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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-submissions', selectedComp] })
    qc.invalidateQueries({ queryKey: ['admin-submissions-summary'] })
  }

  const exportMutation = useMutation({
    mutationFn: () => billingService.exportBilling(selectedComp!),
    onSuccess: () => setConfirmExport(false),
  })

  const totalMembers = summary?.total_members ?? 0
  const compSummary = summary?.competencias.find((c) => c.competencia === selectedComp)
  const approvedCount = compSummary?.total_approved ?? 0
  const isComplete = approvedCount >= totalMembers && totalMembers > 0

  const competencias = summary?.competencias ?? []
  const compIdx = competencias.findIndex((c) => c.competencia === selectedComp)

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList size={16} className="text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Aprovações</h2>
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
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={() => setSelectedComp(competencias[compIdx + 1]?.competencia ?? null)}
            disabled={compIdx >= competencias.length - 1}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex gap-2 flex-wrap">
            {competencias.map((c) => (
              <button
                key={c.competencia}
                onClick={() => setSelectedComp(c.competencia)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  selectedComp === c.competencia
                    ? 'bg-blue-700/20 text-blue-300 border-blue-700/40'
                    : 'text-slate-400 border-slate-700 hover:border-blue-600 hover:text-slate-200'
                }`}
              >
                {competenciaLabel(c.competencia)}
                <span className="ml-1.5 text-slate-500">
                  {c.total_approved}/{totalMembers}
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setSelectedComp(competencias[compIdx - 1]?.competencia ?? null)}
            disabled={compIdx <= 0}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-500 py-6 text-center">Nenhuma submissão recebida ainda.</p>
      )}

      {selectedComp && (
        <>
          {/* Progress bar */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl px-5 py-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400">
                {competenciaLabel(selectedComp)} — {approvedCount} aprovados de {totalMembers}{' '}
                esperados
              </span>
              {compSummary && compSummary.total_pending > 0 && (
                <span className="text-xs text-amber-400">
                  {compSummary.total_pending} pendente{compSummary.total_pending > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="w-full bg-slate-700 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${isComplete ? 'bg-emerald-500' : 'bg-blue-500'}`}
                style={{
                  width:
                    totalMembers > 0
                      ? `${Math.min(100, (approvedCount / totalMembers) * 100)}%`
                      : '0%',
                }}
              />
            </div>
          </div>

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
              {submissions.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-6">
                  Nenhuma submissão para esta competência.
                </p>
              )}
            </div>
          )}

          {/* Export button */}
          {approvedCount > 0 &&
            (!confirmExport ? (
              <button
                onClick={() => (isComplete ? exportMutation.mutate() : setConfirmExport(true))}
                disabled={exportMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors"
              >
                {exportMutation.isPending ? <Spinner size="sm" /> : <Download size={14} />}
                Gerar faturamento
              </button>
            ) : (
              <div className="bg-amber-950/40 border border-amber-700/40 rounded-xl px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                  <p className="text-xs font-semibold text-amber-400">
                    {totalMembers - approvedCount} membro
                    {totalMembers - approvedCount > 1 ? 's' : ''} ainda não aprovado
                    {totalMembers - approvedCount > 1 ? 's' : ''}
                  </p>
                </div>
                <p className="text-xs text-slate-400 mb-3 pl-5">
                  O faturamento será gerado somente com as {approvedCount} submissões aprovadas.
                  Deseja continuar?
                </p>
                <div className="flex gap-2 pl-5">
                  <button
                    onClick={() => exportMutation.mutate()}
                    disabled={exportMutation.isPending}
                    className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5"
                  >
                    {exportMutation.isPending ? <Spinner size="sm" /> : <Download size={12} />}
                    Gerar assim mesmo
                  </button>
                  <button
                    onClick={() => setConfirmExport(false)}
                    className="px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ))}
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
