import { X, Download } from 'lucide-react'
import { Spinner } from '../../components/Spinner'
import { competenciaLabel, fmtDatetime } from '../../lib/format'
import type { TlEvaluation } from '../../types'

const CLASSIF: Record<number, string> = {
  5: 'Excelente',
  4: 'Bom',
  3: 'Regular',
  2: 'Insatisfatório',
  1: 'Insatisfatório',
}

function scoreBadgeCls(nota: number): string {
  if (nota >= 4) return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
  if (nota === 3) return 'bg-amber-500/10 border-amber-500/30 text-amber-400'
  return 'bg-red-500/10 border-red-500/30 text-red-400'
}

const DIMS: Array<{ label: string; notaKey: keyof TlEvaluation; paraKey: keyof TlEvaluation }> = [
  { label: 'Comportamental', notaKey: 'comportamentalNota', paraKey: 'comportamentalParagrafo' },
  { label: 'Técnica', notaKey: 'tecnicaNota', paraKey: 'tecnicaParagrafo' },
  { label: 'Prazos de Entrega', notaKey: 'prazoNota', paraKey: 'prazoParagrafo' },
]

interface Props {
  squadName: string
  competencia: string
  closedAt: string | undefined
  evaluations: TlEvaluation[]
  isDownloading: boolean
  onDownload: () => void
  onClose: () => void
}

export function PdfPreviewModal({
  squadName,
  competencia,
  closedAt,
  evaluations,
  isDownloading,
  onDownload,
  onClose,
}: Readonly<Props>) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div className="relative bg-slate-800 border border-slate-700 rounded-xl w-full max-w-3xl mx-4 p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-slate-100">Panorama da squad</h2>
          <button
            onClick={onClose}
            aria-label="Fechar modal"
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          {squadName} · {competenciaLabel(competencia)}
          {closedAt && ` · Encerrado em ${fmtDatetime(closedAt)}`}
        </p>

        {evaluations.length === 0 ? (
          <p className="text-sm text-slate-500 italic py-6 text-center">
            Ciclo encerrado sem nenhum profissional confirmado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left px-2 py-2 text-slate-500 uppercase text-[10px] tracking-wide whitespace-nowrap">
                    Dimensão
                  </th>
                  {evaluations.map((ev) => (
                    <th key={ev.id} className="text-center px-2 py-2 whitespace-nowrap">
                      <span className="block text-slate-200 font-semibold">
                        {(ev.nome ?? `#${ev.squadMemberId}`).split(' ')[0]}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIMS.map(({ label, notaKey }) => (
                  <tr key={label} className="border-t border-slate-700">
                    <td className="px-2 py-2.5 text-slate-300 whitespace-nowrap">{label}</td>
                    {evaluations.map((ev) => {
                      const nota = ev[notaKey] as number
                      return (
                        <td key={ev.id} className="text-center px-2 py-2.5">
                          <span
                            className={`inline-block whitespace-nowrap text-[11px] font-bold px-2 py-0.5 rounded-full border ${scoreBadgeCls(nota)}`}
                          >
                            {nota} · {CLASSIF[nota]}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end mt-5">
          <button
            onClick={onDownload}
            disabled={isDownloading || evaluations.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors"
          >
            {isDownloading ? <Spinner size="sm" /> : <Download size={14} />}
            Baixar PDF
          </button>
        </div>
      </div>
    </div>
  )
}
