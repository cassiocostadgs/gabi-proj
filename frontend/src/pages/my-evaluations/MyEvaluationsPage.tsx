import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layout } from '../../components/Layout'
import { clientEvaluationService } from '../../services/client-evaluation.service'
import { EvaluationSummary } from './EvaluationSummary'
import { EvaluationChart } from './EvaluationChart'
import { EvaluationHistory } from './EvaluationHistory'
import type { ClientEvaluation } from '../../types'

type RangeFilter = '6' | '12' | 'all'

const RANGE_OPTIONS: Array<{ value: RangeFilter; label: string }> = [
  { value: '6', label: '6 meses' },
  { value: '12', label: '12 meses' },
  { value: 'all', label: 'Tudo' },
]

const RANGE_LABEL: Record<RangeFilter, string> = { '6': '6m', '12': '12m', all: 'tudo' }

function filterByRange(evaluationsAsc: ClientEvaluation[], range: RangeFilter): ClientEvaluation[] {
  if (range === 'all') return evaluationsAsc
  return evaluationsAsc.slice(-Number(range))
}

export function MyEvaluationsPage() {
  const [range, setRange] = useState<RangeFilter>('12')
  const { data: evaluations, isLoading } = useQuery({
    queryKey: ['my-evaluations'],
    queryFn: clientEvaluationService.getMyEvaluations,
  })

  const evaluationsAsc = useMemo(
    () => [...(evaluations ?? [])].sort((a, b) => a.competencia.localeCompare(b.competencia)),
    [evaluations]
  )
  const periodEvaluations = useMemo(
    () => filterByRange(evaluationsAsc, range),
    [evaluationsAsc, range]
  )
  const latest = evaluationsAsc[evaluationsAsc.length - 1]
  const previous = evaluationsAsc[evaluationsAsc.length - 2] ?? null

  return (
    <Layout>
      <div className="px-6 py-7 max-w-4xl">
        <h1 className="text-lg font-bold text-slate-100 mb-6">Minhas Avaliações — Cliente MAG</h1>

        {!isLoading && latest && (
          <>
            <EvaluationSummary
              latest={latest}
              previous={previous}
              periodEvaluations={periodEvaluations}
              rangeLabel={RANGE_LABEL[range]}
            />

            <div className="bg-slate-800 border border-slate-700 rounded-xl px-5 py-4 mb-6">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                <h2 className="text-sm font-semibold text-slate-200">Evolução por competência</h2>
                <div className="flex gap-1 bg-slate-900 border border-slate-700 rounded-lg p-1">
                  {RANGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRange(opt.value)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors ${
                        range === opt.value
                          ? 'bg-slate-700 text-slate-100'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <EvaluationChart evaluations={periodEvaluations} />

              <p className="text-[11px] text-slate-500 mt-4 pt-3 border-t border-slate-700">
                Escala de 1 a 5 · <span className="text-emerald-400 font-semibold">verde</span> =
                4–5 (dentro/acima do esperado) ·{' '}
                <span className="text-amber-400 font-semibold">amarelo</span> = 3 (em evolução) ·{' '}
                <span className="text-red-400 font-semibold">vermelho</span> = 1–2 (requer atenção).
              </p>
            </div>
          </>
        )}

        <EvaluationHistory isLoading={isLoading} evaluations={evaluations} />
      </div>
    </Layout>
  )
}
