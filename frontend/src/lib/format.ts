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

export function competenciaLabel(val: string): string {
  const [y, m] = val.split('-')
  return `${MONTHS[parseInt(m, 10) - 1]} de ${y}`
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
