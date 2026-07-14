export type RangeFilter = '6' | '12' | 'all'

export const RANGE_OPTIONS: Array<{ value: RangeFilter; label: string }> = [
  { value: '6', label: '6 meses' },
  { value: '12', label: '12 meses' },
  { value: 'all', label: 'Tudo' },
]

export const RANGE_LABEL: Record<RangeFilter, string> = { '6': '6m', '12': '12m', all: 'tudo' }

export function filterByRange<T>(itemsAsc: T[], range: RangeFilter): T[] {
  if (range === 'all') return itemsAsc
  return itemsAsc.slice(-Number(range))
}
