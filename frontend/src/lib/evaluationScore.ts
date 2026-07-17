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

// Escala de referência oficial das avaliações (1-5), igual à usada na avaliação de TL
// e nos e-mails de avaliação da MAG. Fonte única — não duplicar este texto em outros pontos.
export const SCORE_LEVEL_LABEL: Record<number, string> = {
  1: 'Insatisfatório',
  2: 'Insatisfatório',
  3: 'Regular',
  4: 'Bom',
  5: 'Excelente',
}

export const SCORE_LEVEL_DESCRIPTION: Record<number, string> = {
  1: 'Não atende ou atende minimamente às expectativas quanto ao padrão esperado de desempenho definido para a competência avaliada. Precisa desenvolver-se total ou quase que totalmente na competência.',
  2: 'Não atende ou atende minimamente às expectativas quanto ao padrão esperado de desempenho definido para a competência avaliada. Precisa desenvolver-se total ou quase que totalmente na competência.',
  3: 'Atende parcialmente às expectativas quanto ao padrão esperado de desempenho definido para a competência avaliada. O desempenho alterna entre atendimento e não atendimento. Precisa melhorar o desempenho.',
  4: 'Atende às expectativas quanto ao padrão esperado de desempenho, definido para a competência avaliada. Alcança o padrão esperado, demonstrando resultado de desempenho plenamente satisfatório.',
  5: 'Supera as expectativas quanto ao padrão esperado de desempenho definido para a competência. Excede ao padrão esperado, demonstrando desempenho além das expectativas. Agrega melhorias e resultados visíveis, reconhecidos e confirmados no âmbito da entidade.',
}

export function scoreHint(score: number): string {
  const label = SCORE_LEVEL_LABEL[score]
  const description = SCORE_LEVEL_DESCRIPTION[score]
  if (!label || !description) return ''
  return `${label} (${score}) — ${description}`
}
