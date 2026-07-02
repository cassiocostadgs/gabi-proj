import { describe, it, expect } from 'vitest'
import {
  competenciaLabel,
  competenciaShort,
  fmtDatetime,
  fmtHours,
  diffClass,
  monthDateRange,
  currentCompetencia,
} from './format'

describe('competenciaLabel', () => {
  it('formats january correctly', () => {
    expect(competenciaLabel('2025-01')).toBe('Janeiro de 2025')
  })

  it('formats december correctly', () => {
    expect(competenciaLabel('2024-12')).toBe('Dezembro de 2024')
  })

  it('formats middle months correctly', () => {
    expect(competenciaLabel('2025-06')).toBe('Junho de 2025')
  })
})

describe('fmtHours', () => {
  it('formats integer hours with two decimals', () => {
    expect(fmtHours(8)).toBe('8.00h')
  })

  it('formats fractional hours', () => {
    expect(fmtHours(7.5)).toBe('7.50h')
  })

  it('formats zero', () => {
    expect(fmtHours(0)).toBe('0.00h')
  })
})

describe('competenciaShort', () => {
  it('formats january correctly', () => {
    expect(competenciaShort('2025-01')).toBe('Jan/25')
  })

  it('formats december correctly', () => {
    expect(competenciaShort('2024-12')).toBe('Dez/24')
  })

  it('formats all months via short names', () => {
    const expected = [
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
    expected.forEach((abbr, i) => {
      const month = String(i + 1).padStart(2, '0')
      expect(competenciaShort(`2025-${month}`)).toBe(`${abbr}/25`)
    })
  })
})

describe('fmtDatetime', () => {
  it('returns empty string for empty input', () => {
    expect(fmtDatetime('')).toBe('')
  })

  it('formats an ISO datetime string', () => {
    const result = fmtDatetime('2025-06-15 10:30:00')
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })
})

describe('monthDateRange', () => {
  it('returns first and last day for a 31-day month', () => {
    expect(monthDateRange('2025-01')).toEqual({ startDate: '2025-01-01', endDate: '2025-01-31' })
  })

  it('returns first and last day for february in a leap year', () => {
    expect(monthDateRange('2024-02')).toEqual({ startDate: '2024-02-01', endDate: '2024-02-29' })
  })

  it('returns first and last day for february in a non-leap year', () => {
    expect(monthDateRange('2025-02')).toEqual({ startDate: '2025-02-01', endDate: '2025-02-28' })
  })
})

describe('currentCompetencia', () => {
  it('matches the YYYY-MM format', () => {
    expect(currentCompetencia()).toMatch(/^\d{4}-\d{2}$/)
  })
})

describe('diffClass', () => {
  it('returns red for positive diff above tolerance', () => {
    expect(diffClass(0.5)).toBe('text-red-400')
  })

  it('returns green for negative diff below tolerance', () => {
    expect(diffClass(-0.5)).toBe('text-emerald-400')
  })

  it('returns neutral for diff within tolerance', () => {
    expect(diffClass(0)).toBe('text-slate-500')
    expect(diffClass(0.05)).toBe('text-slate-500')
    expect(diffClass(-0.05)).toBe('text-slate-500')
  })
})
