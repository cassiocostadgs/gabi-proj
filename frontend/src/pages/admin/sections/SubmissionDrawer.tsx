import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, CheckCircle, XCircle, AlertTriangle, Lock } from 'lucide-react'
import { Spinner } from '../../../components/Spinner'
import { PersonCard } from '../../../components/PersonCard'
import { billingService } from '../../../services/billing.service'
import { fmtHours } from '../../../lib/format'
import type { Submission, Person } from '../../../types'

function hoursChanged(current: Person, original: Person): boolean {
  return Math.abs(current.task_total - original.task_total) > 0.01
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const BORDER_CLS: Record<string, string> = {
  approved: 'border-l-4 border-l-emerald-600',
  rejected: 'border-l-4 border-l-red-700',
  pending:  'border-l-4 border-l-slate-600',
}

interface Props {
  submission: Submission
  onClose: () => void
  onActionDone: () => void
}

export function SubmissionDrawer({ submission, onClose, onActionDone }: Props) {
  const qc = useQueryClient()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['submission-preview', submission.id],
    queryFn: () => billingService.previewSubmission(submission.id),
    staleTime: 0,
  })

  const approveMutation = useMutation({
    mutationFn: () => billingService.approveSubmission(submission.id, data!.person),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-submissions'] })
      qc.invalidateQueries({ queryKey: ['admin-submissions-summary'] })
      onActionDone()
      onClose()
    },
  })

  const rejectMutation = useMutation({
    mutationFn: () => billingService.rejectSubmission(submission.id, rejectReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-submissions'] })
      qc.invalidateQueries({ queryKey: ['admin-submissions-summary'] })
      onActionDone()
      onClose()
    },
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const current = data?.person
  const original = data?.submission_snapshot
  const isImmutable = data?.is_immutable ?? false
  const taskDiffers = !isImmutable && current && original ? hoursChanged(current, original) : false
  const borderCls = BORDER_CLS[submission.status] ?? BORDER_CLS.pending

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      <div className={`fixed right-0 top-0 h-full w-full max-w-3xl bg-slate-900 border-l border-slate-700 z-50 flex flex-col shadow-2xl ${borderCls}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
          <div className="min-w-0">
            <p className="font-semibold text-slate-100 text-sm truncate">{submission.nome_profissional}</p>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {submission.user_email} · {submission.competencia}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Spinner />
              <p className="text-xs text-slate-500">
                {submission.status === 'approved'
                  ? 'Carregando snapshot de aprovação…'
                  : 'Reprocessando com dados atuais do Task…'}
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 text-xs text-red-300">
              Erro ao carregar: {(error as Error).message}
            </div>
          )}

          {current && (
            <>
              {/* Immutable audit banner (approved) */}
              {isImmutable && (
                <div className="flex items-start gap-2.5 bg-emerald-950/50 border border-emerald-800/50 rounded-xl px-4 py-3 mb-4">
                  <Lock size={13} className="text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-emerald-300">
                      Snapshot de aprovação — registro imutável
                    </p>
                    <p className="text-[0.7rem] text-emerald-700 mt-0.5">
                      Aprovado em {fmtDate(data?.reviewed_at ?? null)} por {data?.reviewed_by ?? '—'}
                    </p>
                  </div>
                </div>
              )}

              {/* Rejected status banner */}
              {submission.status === 'rejected' && submission.rejection_reason && (
                <div className="flex items-start gap-2.5 bg-red-950/50 border border-red-800/50 rounded-xl px-4 py-3 mb-4">
                  <XCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-red-300">Reprovado</p>
                    <p className="text-[0.7rem] text-red-500 mt-0.5">{submission.rejection_reason}</p>
                  </div>
                </div>
              )}

              {/* Task diff banner (pending / rejected only) */}
              {!isImmutable && taskDiffers && (
                <div className="flex items-start gap-2.5 bg-amber-950/60 border border-amber-700/60 rounded-xl px-4 py-3 mb-4">
                  <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-300">
                      Task atualizado após a submissão
                    </p>
                    <p className="text-[0.7rem] text-amber-600 mt-0.5">
                      Submetido: {fmtHours(original!.task_total)} Task fat.
                      {' → '}
                      Atual: {fmtHours(current.task_total)} Task fat.
                    </p>
                  </div>
                </div>
              )}

              {/* Consistent banner (pending / rejected only) */}
              {!isImmutable && !taskDiffers && (
                <div className="flex items-center gap-2 bg-green-950/40 border border-green-800/40 rounded-xl px-4 py-2.5 mb-4">
                  <CheckCircle size={13} className="text-green-500 shrink-0" />
                  <p className="text-xs text-green-400">Consistente com Task atual</p>
                </div>
              )}

              <PersonCard person={current} />
            </>
          )}
        </div>

        {/* Footer — hidden for approved (immutable) */}
        {current && !isImmutable && (
          <div className="border-t border-slate-700 px-5 py-4 shrink-0 space-y-3">
            {rejectOpen ? (
              <div className="space-y-2">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Motivo da reprovação (opcional)"
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-red-500 resize-none transition-colors"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setRejectOpen(false)}
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
                    Confirmar reprovação
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setRejectOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 transition-colors"
                >
                  <XCircle size={13} /> Reprovar
                </button>
                <button
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white transition-colors"
                >
                  {approveMutation.isPending ? <Spinner size="sm" /> : <CheckCircle size={13} />}
                  Aprovar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
