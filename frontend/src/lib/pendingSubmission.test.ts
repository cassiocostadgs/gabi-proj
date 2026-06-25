import { describe, it, expect, beforeEach } from 'vitest'
import { pendingSubmission } from './pendingSubmission'

describe('pendingSubmission', () => {
  beforeEach(() => {
    pendingSubmission.clear()
  })

  it('returns null when nothing is set', () => {
    expect(pendingSubmission.get()).toBeNull()
  })

  it('stores and retrieves a pending submission', () => {
    const file = new File(['content'], 'ga.xls')
    pendingSubmission.set(file, '2025-06')
    const pending = pendingSubmission.get()
    expect(pending?.gaFile).toBe(file)
    expect(pending?.competencia).toBe('2025-06')
  })

  it('clears the stored submission', () => {
    const file = new File(['content'], 'ga.xls')
    pendingSubmission.set(file, '2025-06')
    pendingSubmission.clear()
    expect(pendingSubmission.get()).toBeNull()
  })
})
