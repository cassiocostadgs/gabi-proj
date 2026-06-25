import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Clock, CheckCircle2, XCircle, FileSpreadsheet, ChevronRight } from 'lucide-react'
import { Layout } from '../../components/Layout'
import { Spinner } from '../../components/Spinner'
import { billingService } from '../../services/billing.service'
import { competenciaLabel } from '../../lib/format'
import type { SubmissionStatus } from '../../types'

const STATUS_CONFIG: Record<
  SubmissionStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  pending: {
    label: 'Aguardando',
    icon: Clock,
    className: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
  },
  approved: {
    label: 'Aprovado',
    icon: CheckCircle2,
    className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  },
  rejected: {
    label: 'Rejeitado',
    icon: XCircle,
    className: 'text-red-400 bg-red-500/10 border-red-500/25',
  },
}

function StatusBadge({ status }: Readonly<{ status: SubmissionStatus }>) {
  const { label, icon: Icon, className } = STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${className}`}
    >
      <Icon size={12} strokeWidth={2.5} />
      {label}
    </span>
  )
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function SubmissionsPage() {
  const navigate = useNavigate()
  const { data: submissions, isLoading } = useQuery({
    queryKey: ['my-submissions'],
    queryFn: billingService.listMySubmissions,
  })

  return (
    <Layout>
      <div className="flex justify-center px-4 pt-[10vh] pb-12">
        <div className="w-full max-w-[640px] flex flex-col gap-4">
          <div className="mb-1">
            <h1 className="text-lg font-semibold text-slate-100">Minhas submissões</h1>
            <p className="text-sm text-slate-500 mt-1">
              Histórico de apontamentos enviados para aprovação.
            </p>
          </div>

          {isLoading && (
            <div className="flex justify-center py-12">
              <Spinner size="md" />
            </div>
          )}

          {!isLoading && submissions?.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center">
                <FileSpreadsheet size={22} className="text-slate-600" />
              </div>
              <p className="text-sm text-slate-500">Nenhuma submissão encontrada.</p>
            </div>
          )}

          {!isLoading && submissions && submissions.length > 0 && (
            <ul className="flex flex-col gap-3">
              {submissions.map((sub) => (
                <li key={sub.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/submissions/${sub.id}`)}
                    className="w-full text-left bg-slate-800/60 border border-slate-700 rounded-xl px-5 py-4 flex flex-col gap-2 cursor-pointer hover:border-slate-600 hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-sm font-semibold text-slate-100">
                        {competenciaLabel(sub.competencia)}
                      </span>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={sub.status} />
                        <ChevronRight size={14} className="text-slate-600" />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                      <span>
                        Arquivo:{' '}
                        <span className="text-slate-400 font-medium">{sub.ga_filename}</span>
                      </span>
                      <span>
                        Horas Task:{' '}
                        <span className="text-slate-400 font-medium">
                          {sub.horas_task.toFixed(1)}h
                        </span>
                      </span>
                      <span>
                        Enviado em:{' '}
                        <span className="text-slate-400 font-medium">
                          {formatDate(sub.submitted_at)}
                        </span>
                      </span>
                      {sub.reviewed_at && (
                        <span>
                          Revisado em:{' '}
                          <span className="text-slate-400 font-medium">
                            {formatDate(sub.reviewed_at)}
                          </span>
                        </span>
                      )}
                    </div>

                    {sub.status === 'rejected' && sub.rejection_reason && (
                      <div className="mt-1 rounded-lg bg-red-950/40 border border-red-800/30 px-3 py-2 text-xs text-red-300">
                        <span className="font-semibold text-red-400">Motivo: </span>
                        {sub.rejection_reason}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Layout>
  )
}
