const MONTHS = [
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

const MONTHS_SHORT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

export function competenciaLabel(val: string): string {
  const [y, m] = val.split('-')
  return `${MONTHS[Number.parseInt(m, 10) - 1]} de ${y}`
}

export function competenciaSlash(val: string): string {
  const [y, m] = val.split('-')
  return `${MONTHS[Number.parseInt(m, 10) - 1]}/${y}`
}

export function competenciaShort(val: string): string {
  const [y, m] = val.split('-')
  return `${MONTHS_SHORT[Number.parseInt(m, 10) - 1]}/${y.slice(2)}`
}

export function fmtDatetime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('+') ? '' : 'Z'))
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

export function fmtHours(h: number): string {
  return `${h.toFixed(2)}h`
}

export function diffClass(diff: number): string {
  if (diff > 0.05) return 'text-red-400'
  if (diff < -0.05) return 'text-emerald-400'
  return 'text-slate-500'
}

export function monthDateRange(competencia: string): { startDate: string; endDate: string } {
  const [y, m] = competencia.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    startDate: `${competencia}-01`,
    endDate: `${competencia}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function currentCompetencia(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function addMonths(competencia: string, delta: number): string {
  let [y, m] = competencia.split('-').map(Number)
  m += delta
  while (m > 12) {
    m -= 12
    y += 1
  }
  while (m < 1) {
    m += 12
    y -= 1
  }
  return `${y}-${String(m).padStart(2, '0')}`
}
