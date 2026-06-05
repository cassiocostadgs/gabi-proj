import { describe, it, expect } from 'vitest'
import { competenciaLabel, fmtHours, diffClass } from './format'

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
