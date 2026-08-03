import { ChevronDown } from 'lucide-react'
import { competenciaShort } from '../../lib/format'
import { scoreBand, SCORE_BAND_BADGE_CLS } from '../../lib/evaluationScore'
import { RANGE_LABEL, filterByRange, type RangeFilter } from '../../lib/evaluationRange'
import { EvaluationSummary } from './EvaluationSummary'
import { EvaluationChart } from './EvaluationChart'
import { EvaluationHistory } from './EvaluationHistory'
import type { EvaluationScoreRecord } from '../../types'

export interface EvaluationRosterPerson {
  key: string | number // unique id — e.g. user_email or squadMemberId
  name: string
  history: EvaluationScoreRecord[] // ascending by competência
}

interface EvaluationRosterCardProps {
  person: EvaluationRosterPerson
  range: RangeFilter
  defaultOpen: boolean
}

export function EvaluationRosterCard({
  person,
  range,
  defaultOpen,
}: Readonly<EvaluationRosterCardProps>) {
  const historyAsc = person.history
  const latest = historyAsc[historyAsc.length - 1]
  const previous = historyAsc[historyAsc.length - 2] ?? null
  const periodEvaluations = filterByRange(historyAsc, range)
  const historyDesc = [...historyAsc].sort((a, b) => b.competencia.localeCompare(a.competencia))

  return (
    <details
      open={defaultOpen}
      className="group bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden"
    >
      <summary className="px-5 py-4 cursor-pointer flex items-center gap-3 [&::-webkit-details-marker]:hidden">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-100 truncate">{person.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Última avaliação: {competenciaShort(latest.competencia)}
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {latest.comportamental_nota != null && (
            <span
              className={`px-2 py-0.5 rounded-full border text-[0.65rem] font-bold ${SCORE_BAND_BADGE_CLS[scoreBand(latest.comportamental_nota)]}`}
            >
              C {latest.comportamental_nota}
            </span>
          )}
          {latest.tecnica_nota != null && (
            <span
              className={`px-2 py-0.5 rounded-full border text-[0.65rem] font-bold ${SCORE_BAND_BADGE_CLS[scoreBand(latest.tecnica_nota)]}`}
            >
              T {latest.tecnica_nota}
            </span>
          )}
          {latest.prazo_nota != null && (
            <span
              className={`px-2 py-0.5 rounded-full border text-[0.65rem] font-bold ${SCORE_BAND_BADGE_CLS[scoreBand(latest.prazo_nota)]}`}
            >
              P {latest.prazo_nota}
            </span>
          )}
        </div>
        <ChevronDown
          size={15}
          className="text-slate-500 shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="px-5 pb-5 pt-1 border-t border-slate-700 space-y-5">
        <EvaluationSummary
          latest={latest}
          previous={previous}
          periodEvaluations={periodEvaluations}
          rangeLabel={RANGE_LABEL[range]}
        />
        <div className="bg-slate-900/40 border border-slate-700/60 rounded-xl px-4 py-4">
          <EvaluationChart evaluations={periodEvaluations} />
          <p className="text-[11px] text-slate-500 mt-4 pt-3 border-t border-slate-700">
            Escala de 1 a 5 · <span className="text-emerald-400 font-semibold">verde</span> = 4–5
            (dentro/acima do esperado) ·{' '}
            <span className="text-amber-400 font-semibold">amarelo</span> = 3 (em evolução) ·{' '}
            <span className="text-red-400 font-semibold">vermelho</span> = 1–2 (requer atenção).
          </p>
        </div>
        <EvaluationHistory isLoading={false} evaluations={historyDesc} />
      </div>
    </details>
  )
}
