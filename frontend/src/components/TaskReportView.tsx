import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, AlertTriangle, Info } from 'lucide-react'
import { MonthPicker } from './MonthPicker'
import { Spinner } from './Spinner'
import { competenciaLabel } from '../lib/format'
import type { TaskReportDay } from '../types'

const TABLE_HEADERS = ['Projeto', 'Tarefa', 'Descrição', 'Início', 'Término', 'Horas', 'Área']

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function shiftCompetencia(competencia: string, delta: number): string {
  const [y, m] = competencia.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function CompetenciaSwitcher({
  competencia,
  onChange,
}: Readonly<{ competencia: string; onChange: (competencia: string) => void }>) {
  const [showPicker, setShowPicker] = useState(false)
  const [pickerYear, setPickerYear] = useState(Number(competencia.split('-')[0]))

  return (
    <div className="relative">
      <div className="flex items-center gap-1 bg-slate-800 border border-slate-600 rounded-lg px-1 py-1">
        <button
          onClick={() => onChange(shiftCompetencia(competencia, -1))}
          className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={() => {
            setPickerYear(Number(competencia.split('-')[0]))
            setShowPicker((v) => !v)
          }}
          className="px-2 py-1 text-sm font-medium text-slate-100 hover:text-white transition-colors min-w-[130px] text-center"
        >
          {competenciaLabel(competencia)}
        </button>
        <button
          onClick={() => onChange(shiftCompetencia(competencia, 1))}
          className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      {showPicker && (
        <div className="absolute z-10 mt-2 bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-xl w-56">
          <MonthPicker
            pickerYear={pickerYear}
            selectedCompetencia={competencia}
            onYearChange={(delta) => setPickerYear((y) => y + delta)}
            onMonthSelect={(c) => {
              onChange(c)
              setShowPicker(false)
            }}
          />
        </div>
      )}
    </div>
  )
}

function AreaBadge({ area, unexpected }: Readonly<{ area: string; unexpected: boolean }>) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-slate-400">{area}</span>
      {unexpected && (
        <span
          title="Área fora do esperado (FATURADO/NAO_FATURADO) — possível erro de cadastro no Task"
          className="inline-flex items-center gap-1 bg-amber-900/60 text-amber-300 border border-amber-700 text-[0.6rem] font-bold px-1.5 py-0.5 rounded"
        >
          <AlertTriangle size={10} />
          revisar
        </span>
      )}
    </span>
  )
}

function DayGroup({ day }: Readonly<{ day: TaskReportDay }>) {
  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between bg-slate-800 px-4 py-2">
        <span className="text-sm font-semibold text-slate-200">{day.date}</span>
        <span className="text-sm font-semibold text-slate-300">{day.total.toFixed(2)}h</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              {TABLE_HEADERS.map((h) => (
                <th
                  key={h}
                  className="text-left px-3 py-2 bg-slate-900 text-slate-500 uppercase text-[0.6rem] tracking-wide font-semibold"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {day.entries.map((entry) => (
              <tr
                key={`${entry.task_code}-${entry.start}-${entry.end}`}
                className="bg-slate-950/60 hover:brightness-110"
              >
                <td className="px-3 py-1.5 text-slate-400">{entry.project}</td>
                <td className="px-3 py-1.5 text-slate-400">{entry.task_code}</td>
                <td className="px-3 py-1.5 text-slate-300">{entry.description}</td>
                <td className="px-3 py-1.5 text-slate-400">{entry.start}</td>
                <td className="px-3 py-1.5 text-slate-400">{entry.end}</td>
                <td className="px-3 py-1.5 text-slate-300 font-medium">{entry.hours.toFixed(2)}</td>
                <td className="px-3 py-1.5">
                  <AreaBadge area={entry.area} unexpected={entry.unexpected_area} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface TaskReportViewProps {
  competencia: string
  onCompetenciaChange: (competencia: string) => void
  days: TaskReportDay[]
  isLoading: boolean
  defaultProject: string | null
  onExport: () => void
  isExporting: boolean
}

export function TaskReportView({
  competencia,
  onCompetenciaChange,
  days,
  isLoading,
  defaultProject,
  onExport,
  isExporting,
}: Readonly<TaskReportViewProps>) {
  const [onlyDefaultProject, setOnlyDefaultProject] = useState(true)
  const [onlyFaturado, setOnlyFaturado] = useState(true)

  const filteredDays = useMemo(() => {
    return days
      .map((day) => {
        const entries = day.entries.filter((e) => {
          if (onlyDefaultProject && defaultProject && e.project !== defaultProject) return false
          if (onlyFaturado && e.area !== 'FATURADO') return false
          return true
        })
        return { ...day, entries, total: round2(entries.reduce((s, e) => s + e.hours, 0)) }
      })
      .filter((day) => day.entries.length > 0)
  }, [days, onlyDefaultProject, onlyFaturado, defaultProject])

  const grandTotal = round2(filteredDays.reduce((s, d) => s + d.total, 0))

  return (
    <div>
      <div
        style={{ top: 'var(--gabi-header-offset, 0px)' }}
        className="sticky z-10 bg-slate-900 pb-4 border-b border-slate-800"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pt-1">
          <div className="flex flex-wrap items-center gap-3">
            <CompetenciaSwitcher competencia={competencia} onChange={onCompetenciaChange} />
            {!isLoading && filteredDays.length > 0 && (
              <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
                <span className="text-[0.65rem] text-slate-500 uppercase tracking-wide">
                  Total do período
                </span>
                <span className="text-sm font-bold text-slate-50">{grandTotal.toFixed(2)}h</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onExport}
              disabled={isExporting || days.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-600 hover:border-blue-500 disabled:opacity-50 text-sm text-slate-200 rounded-lg transition-colors"
            >
              {isExporting ? <Spinner size="sm" /> : <Download size={14} />}
              Exportar XLSX
            </button>
            <div className="relative group shrink-0">
              <span className="flex text-slate-500 hover:text-slate-300 cursor-help">
                <Info size={15} />
              </span>
              <div className="absolute bottom-full right-0 mb-2 w-56 px-3 py-2 rounded-lg text-[11px] leading-snug text-slate-300 bg-slate-900 border border-slate-700 shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-20">
                Exportação sempre inclui todos os projetos e áreas, independentemente dos filtros
                abaixo.
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
            <input
              type="checkbox"
              checked={onlyDefaultProject}
              onChange={(e) => setOnlyDefaultProject(e.target.checked)}
              disabled={!defaultProject}
              className="accent-blue-500"
            />
            Somente {defaultProject ?? '—'}
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
            <input
              type="checkbox"
              checked={onlyFaturado}
              onChange={(e) => setOnlyFaturado(e.target.checked)}
              className="accent-blue-500"
            />{' '}
            Somente Faturado
          </label>
        </div>
      </div>

      <div className="pt-4">
        <ReportBody isLoading={isLoading} days={filteredDays} />
      </div>
    </div>
  )
}

function ReportBody({ isLoading, days }: Readonly<{ isLoading: boolean; days: TaskReportDay[] }>) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }
  if (days.length === 0) {
    return (
      <p className="text-sm text-slate-500 text-center py-10">
        Nenhum apontamento encontrado para o período e filtros selecionados.
      </p>
    )
  }
  return (
    <div className="space-y-4">
      {days.map((day) => (
        <DayGroup key={day.date} day={day} />
      ))}
    </div>
  )
}
