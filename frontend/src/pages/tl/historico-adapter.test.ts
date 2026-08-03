import { describe, it, expect } from 'vitest'
import { toEvaluationScoreRecord } from './historico-adapter'
import type { TlEvaluation } from '../../types'

const BASE_EVALUATION: TlEvaluation = {
  id: 1,
  squadMemberId: 10,
  nome: 'Bruno Fernandez',
  competencia: '2026-07',
  comportamentalNota: 5,
  comportamentalParagrafo: 'Excelente colaboração.',
  tecnicaNota: 4,
  tecnicaParagrafo: 'Boa entrega técnica.',
  prazoNota: 3,
  prazoParagrafo: 'Cumpriu parcialmente os prazos.',
  status: 'confirmado',
  confirmedBy: 'tl@db1.com.br',
  confirmedAt: '2026-07-31T12:00:00Z',
}

describe('toEvaluationScoreRecord', () => {
  it('maps camelCase TL fields to the shared snake_case score-record shape', () => {
    expect(toEvaluationScoreRecord(BASE_EVALUATION)).toEqual({
      competencia: '2026-07',
      comportamental_nota: 5,
      comportamental_comentario: 'Excelente colaboração.',
      tecnica_nota: 4,
      tecnica_comentario: 'Boa entrega técnica.',
      prazo_nota: 3,
      prazo_comentario: 'Cumpriu parcialmente os prazos.',
      comentario_geral: null,
    })
  })

  it('always sets comentario_geral to null — TL evaluations are per-dimension only', () => {
    expect(toEvaluationScoreRecord(BASE_EVALUATION).comentario_geral).toBeNull()
  })
})
