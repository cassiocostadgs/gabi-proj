import { competenciaShort } from '../../lib/format'
import type { ClientEvaluation } from '../../types'

type Band = 'good' | 'warn' | 'crit'

function scoreBand(score: number): Band {
  if (score >= 4) return 'good'
  if (score === 3) return 'warn'
  return 'crit'
}

const BAND_BORDER: Record<Band, string> = {
  good: 'border-emerald-500/30',
  warn: 'border-amber-500/30',
  crit: 'border-red-500/30',
}
const BAND_TEXT: Record<Band, string> = {
  good: 'text-emerald-400',
  warn: 'text-amber-400',
  crit: 'text-red-400',
}

type DimensionKey = 'comportamental_nota' | 'tecnica_nota' | 'prazo_nota'

interface DimensionConfig {
  key: DimensionKey
  label: string
}

const DIMENSIONS: DimensionConfig[] = [
  { key: 'comportamental_nota', label: 'Comportamental' },
  { key: 'tecnica_nota', label: 'Técnica' },
  { key: 'prazo_nota', label: 'Prazo' },
]

function average(evaluationsList: ClientEvaluation[], key: DimensionKey): number | null {
  const values = evaluationsList
    .map((item) => item[key])
    .filter((value): value is number => value != null)
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

interface EvaluationSummaryProps {
  latest: ClientEvaluation
  previous: ClientEvaluation | null
  periodEvaluations: ClientEvaluation[]
  rangeLabel: string
}

export function EvaluationSummary({
  latest,
  previous,
  periodEvaluations,
  rangeLabel,
}: Readonly<EvaluationSummaryProps>) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
      {DIMENSIONS.map((dimension) => {
        const current = latest[dimension.key]
        const beforeValue = previous?.[dimension.key] ?? null
        const diff = current != null && beforeValue != null ? current - beforeValue : null
        const avg = average(periodEvaluations, dimension.key)
        const band = current == null ? null : scoreBand(current)

        return (
          <div
            key={dimension.key}
            className={`bg-slate-800 border rounded-xl px-4 py-3 ${band ? BAND_BORDER[band] : 'border-slate-700'}`}
          >
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
              {dimension.label}
            </p>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${band ? BAND_TEXT[band] : 'text-slate-300'}`}>
                {current ?? '—'}
              </span>
              {diff != null && diff !== 0 && (
                <span
                  className={`text-xs font-semibold ${diff > 0 ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {diff > 0 ? '▲' : '▼'} {Math.abs(diff)}
                </span>
              )}
              {diff === 0 && <span className="text-xs font-semibold text-slate-500">–</span>}
            </div>
            {previous && current != null && (
              <p className="text-[11px] text-slate-500 mt-1.5">
                vs. {competenciaShort(previous.competencia)} · {current}/5
              </p>
            )}
            {avg != null && (
              <p className="text-[11px] text-slate-400 mt-1.5 pt-1.5 border-t border-slate-700/60">
                Média ({rangeLabel}):{' '}
                <span className="font-semibold text-slate-200">{avg.toFixed(1)}</span>
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
