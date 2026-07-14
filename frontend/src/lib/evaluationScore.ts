export type ScoreBand = 'good' | 'warn' | 'crit'

export function scoreBand(score: number): ScoreBand {
  if (score >= 4) return 'good'
  if (score === 3) return 'warn'
  return 'crit'
}

export const SCORE_BAND_BADGE_CLS: Record<ScoreBand, string> = {
  good: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  warn: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  crit: 'bg-red-500/10 border-red-500/30 text-red-400',
}

export const SCORE_BAND_BORDER_CLS: Record<ScoreBand, string> = {
  good: 'border-emerald-500/30',
  warn: 'border-amber-500/30',
  crit: 'border-red-500/30',
}

export const SCORE_BAND_TEXT_CLS: Record<ScoreBand, string> = {
  good: 'text-emerald-400',
  warn: 'text-amber-400',
  crit: 'text-red-400',
}
