import { describe, it, expect } from 'vitest'
import { isGateAQuestion } from './avaliacao-types'

describe('isGateAQuestion', () => {
  it('detects the initial yes/no Gate A prompt', () => {
    expect(
      isGateAQuestion(
        'Houve algum reconhecimento externo ao seu pelo trabalho do Bruno nessa integração — ' +
          'por exemplo, um elogio do PO, agradecimento de alguém das outras squads ou do ' +
          'fornecedor, ou qualquer destaque formal?'
      )
    ).toBe(true)
  })

  it('rejects an open-ended follow-up asking who/how, even if it mentions reconhecimento', () => {
    expect(
      isGateAQuestion(
        'Quem reconheceu o trabalho do Bruno e de que forma — foi um elogio direto, uma ' +
          'mensagem registrada, um destaque em reunião ou outro formato?'
      )
    ).toBe(false)
  })

  it('rejects questions without "reconhec"', () => {
    expect(isGateAQuestion('Pode dar um exemplo concreto do mês?')).toBe(false)
  })

  it('rejects statements without a question mark', () => {
    expect(isGateAQuestion('Não houve reconhecimento externo registrado.')).toBe(false)
  })
})
