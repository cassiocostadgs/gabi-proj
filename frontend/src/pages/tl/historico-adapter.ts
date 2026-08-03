import type { EvaluationScoreRecord, TlEvaluation } from '../../types'

export function toEvaluationScoreRecord(ev: TlEvaluation): EvaluationScoreRecord {
  return {
    competencia: ev.competencia,
    comportamental_nota: ev.comportamentalNota,
    comportamental_comentario: ev.comportamentalParagrafo,
    tecnica_nota: ev.tecnicaNota,
    tecnica_comentario: ev.tecnicaParagrafo,
    prazo_nota: ev.prazoNota,
    prazo_comentario: ev.prazoParagrafo,
    comentario_geral: null,
  }
}
