import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Clock, CheckCircle2, XCircle, Info, Lock } from 'lucide-react'
import { Layout } from '../../components/Layout'
import { Spinner } from '../../components/Spinner'
import { PersonCard } from '../../components/PersonCard'
import { billingService } from '../../services/billing.service'
import { competenciaLabel, fmtDatetime } from '../../lib/format'
import type { SubmissionStatus } from '../../types'

const STATUS_CONFIG: Record<
  SubmissionStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  pending: {
    label: 'Aguardando aprovação',
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

export function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-submission', id],
    queryFn: () => billingService.getMySubmission(Number(id)),
    enabled: !!id,
  })

  const statusCfg = data ? STATUS_CONFIG[data.status] : null
  const StatusIcon = statusCfg?.icon

  return (
    <Layout
      title={data ? competenciaLabel(data.competencia) : 'Detalhe da submissão'}
      subtitle={data?.nome_profissional}
      actions={
        <button
          onClick={() => navigate('/submissions')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-slate-300 border border-slate-600 hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft size={13} /> Voltar
        </button>
      }
    >
      <div className="max-w-7xl mx-auto px-6 py-5">
        {isLoading && (
          <div className="flex justify-center py-16">
            <Spinner size="md" />
          </div>
        )}

        {isError && (
          <div className="bg-red-950/60 border border-red-800/50 rounded-xl px-5 py-4 text-sm text-red-300">
            Não foi possível carregar esta submissão.
          </div>
        )}

        {data && (
          <>
            {/* Status + meta banner */}
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-5 py-3.5 mb-5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {StatusIcon && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${statusCfg!.className}`}
                  >
                    <StatusIcon size={12} strokeWidth={2.5} />
                    {statusCfg!.label}
                  </span>
                )}
                <p className="text-xs text-slate-500">
                  Enviado em{' '}
                  <span className="text-slate-400">{fmtDatetime(data.submitted_at)}</span>
                  {data.reviewed_at && (
                    <>
                      {' · '}Revisado em{' '}
                      <span className="text-slate-400">{fmtDatetime(data.reviewed_at)}</span>
                    </>
                  )}
                </p>
              </div>

              {data.status === 'rejected' && data.rejection_reason && (
                <div className="rounded-lg bg-red-950/40 border border-red-800/30 px-3 py-2 text-xs text-red-300">
                  <span className="font-semibold text-red-400">Motivo da rejeição: </span>
                  {data.rejection_reason}
                </div>
              )}
            </div>

            {/* Snapshot content */}
            {data.snapshot_source === null ? (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-800/60 border border-slate-700 text-sm text-slate-500">
                <Info size={15} className="shrink-0" />
                Detalhes da validação não disponíveis para esta submissão.
              </div>
            ) : (
              <>
                {data.snapshot_source === 'approved' && (
                  <div className="flex items-center gap-2.5 bg-emerald-950/50 border border-emerald-800/50 rounded-xl px-4 py-2.5 mb-4">
                    <Lock size={13} className="text-emerald-500 shrink-0" />
                    <p className="text-xs font-semibold text-emerald-300">
                      Snapshot de aprovação — registro imutável
                    </p>
                  </div>
                )}
                <PersonCard person={data.snapshot!} />
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
