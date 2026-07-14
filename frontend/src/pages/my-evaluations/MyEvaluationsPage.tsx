import { useQuery } from '@tanstack/react-query'
import { Layout } from '../../components/Layout'
import { clientEvaluationService } from '../../services/client-evaluation.service'
import type { ClientEvaluation } from '../../types'

const MONTH_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

function competenciaLong(val: string): string {
  const [y, m] = val.split('-')
  return `${MONTH_PT[Number.parseInt(m, 10) - 1]} / ${y}`
}

function scoreBadgeCls(score: number): string {
  if (score >= 4) return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
  if (score === 3) return 'bg-amber-500/10 border-amber-500/30 text-amber-400'
  return 'bg-red-500/10 border-red-500/30 text-red-400'
}

function EvaluationCard({ evaluation }: Readonly<{ evaluation: ClientEvaluation }>) {
  const showPerDimension = evaluation.comentario_geral == null

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl px-5 py-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-100">
        {competenciaLong(evaluation.competencia)}
      </h3>

      <div className="flex flex-wrap gap-2">
        {evaluation.comportamental_nota != null && (
          <span
            className={`px-2.5 py-1 rounded-full border text-xs font-semibold ${scoreBadgeCls(evaluation.comportamental_nota)}`}
          >
            Comportamental: {evaluation.comportamental_nota}
          </span>
        )}
        {evaluation.tecnica_nota != null && (
          <span
            className={`px-2.5 py-1 rounded-full border text-xs font-semibold ${scoreBadgeCls(evaluation.tecnica_nota)}`}
          >
            Técnica: {evaluation.tecnica_nota}
          </span>
        )}
        {evaluation.prazo_nota != null && (
          <span
            className={`px-2.5 py-1 rounded-full border text-xs font-semibold ${scoreBadgeCls(evaluation.prazo_nota)}`}
          >
            Prazo: {evaluation.prazo_nota}
          </span>
        )}
      </div>

      {evaluation.comentario_geral != null && (
        <div>
          <p className="text-[0.65rem] font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Feedback:
          </p>
          <p className="text-sm text-slate-300">{evaluation.comentario_geral}</p>
        </div>
      )}

      {showPerDimension && (
        <div className="space-y-2">
          {evaluation.comportamental_comentario && (
            <div>
              <p className="text-[0.65rem] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                Comportamental
              </p>
              <p className="text-sm text-slate-300">{evaluation.comportamental_comentario}</p>
            </div>
          )}
          {evaluation.tecnica_comentario && (
            <div>
              <p className="text-[0.65rem] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                Técnica
              </p>
              <p className="text-sm text-slate-300">{evaluation.tecnica_comentario}</p>
            </div>
          )}
          {evaluation.prazo_comentario && (
            <div>
              <p className="text-[0.65rem] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                Prazo
              </p>
              <p className="text-sm text-slate-300">{evaluation.prazo_comentario}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EvaluationsList({
  isLoading,
  evaluations,
}: Readonly<{ isLoading: boolean; evaluations: ClientEvaluation[] | undefined }>) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-32 bg-slate-800 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (evaluations == null || evaluations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
        <p className="text-sm font-semibold text-slate-300">Nenhuma avaliação publicada ainda.</p>
        <p className="text-xs text-slate-500">
          Retorne após o próximo ciclo de aprovação de timesheet.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {evaluations.map((ev) => (
        <EvaluationCard key={ev.id} evaluation={ev} />
      ))}
    </div>
  )
}

export function MyEvaluationsPage() {
  const { data: evaluations, isLoading } = useQuery({
    queryKey: ['my-evaluations'],
    queryFn: clientEvaluationService.getMyEvaluations,
  })

  return (
    <Layout>
      <div className="px-6 py-7 max-w-2xl">
        <h1 className="text-lg font-bold text-slate-100 mb-6">Minhas Avaliações — Cliente MAG</h1>
        <EvaluationsList isLoading={isLoading} evaluations={evaluations} />
      </div>
    </Layout>
  )
}
