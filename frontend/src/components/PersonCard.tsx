import { useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertTriangle,
  Scale,
  Gauge,
  AlarmClock,
  CalendarX,
  Moon,
  type LucideIcon,
} from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  type ChartData,
  type Plugin,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { fmtHours, diffClass } from '../lib/format'
import type { Person, DayResult, Issue } from '../types'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Legend
)

const RULE_ICON: Record<string, LucideIcon> = {
  R0: CalendarX,
  R1: Scale,
  R2: AlarmClock,
  R3: Gauge,
  R4: Moon,
}

const RULE_COLOR: Record<string, string> = {
  R0: 'bg-amber-600',
  R1: 'bg-red-600',
  R2: 'bg-indigo-600',
  R3: 'bg-red-900',
  R4: 'bg-violet-700',
}

const RULE_DOT_COLOR: Record<string, string> = {
  R0: 'bg-amber-500',
  R1: 'bg-red-500',
  R2: 'bg-indigo-400',
  R3: 'bg-red-500',
  R4: 'bg-violet-500',
}

const RULE_DOT_HEX: Record<string, string> = {
  R0: '#f59e0b',
  R1: '#ef4444',
  R2: '#818cf8',
  R3: '#ef4444',
  R4: '#8b5cf6',
}

const ROW_BG: Record<string, string> = {
  ok: 'bg-slate-950/60',
  error: 'bg-red-950/40',
  warning: 'bg-indigo-950/30',
  info: 'bg-indigo-950/30',
  r0: 'bg-amber-950/30',
  r4: 'bg-purple-950/20',
}

const CHIP_CLS: Record<string, string> = {
  R0: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  R1: 'bg-red-500/10 border-red-500/30 text-red-400',
  R2: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
  R4: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
}

export const RULE_LABELS: Record<string, string> = {
  R0: 'Sem apontamento',
  R1: 'Divergência GA/Task',
  R2: 'GA acima de 8h',
  R3: 'Limite mensal excedido',
  R4: 'Fim de semana / Feriado',
}

const RULE_LEGEND = [
  { rule: 'R1', label: 'Divergência' },
  { rule: 'R2', label: 'GA > 8h' },
  { rule: 'R0', label: 'Sem apontamento' },
  { rule: 'R4', label: 'Fim de semana / Feriado' },
] as const

const WEEKDAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

function parseDate(dateStr: string): { dd: number; mm: number; yyyy: number } {
  const parts = dateStr.split('/')
  return {
    dd: Number.parseInt(parts[0], 10),
    mm: Number.parseInt(parts[1], 10),
    yyyy: Number.parseInt(parts[2], 10),
  }
}

function weekdayName(dateStr: string): string {
  const { dd, mm, yyyy } = parseDate(dateStr)
  const jsDay = new Date(yyyy, mm - 1, dd).getDay()
  return WEEKDAY_NAMES[(jsDay + 6) % 7] ?? ''
}

type CalendarCell =
  | { type: 'data'; idx: number; day: DayResult }
  | { type: 'empty-weekend'; dd: number }
  | null

function buildCalendarGrid(days: DayResult[]): CalendarCell[][] {
  if (days.length === 0) return []
  const { mm, yyyy } = parseDate(days[0].date)

  const byDay = new Map<number, number>()
  days.forEach((d, i) => byDay.set(parseDate(d.date).dd, i))

  const daysInMonth = new Date(yyyy, mm, 0).getDate()
  const weeks: CalendarCell[][] = []
  let week: CalendarCell[] = new Array(7).fill(null)
  let hasStartedWeek = false

  for (let d = 1; d <= daysInMonth; d++) {
    const jsDay = new Date(yyyy, mm - 1, d).getDay()
    const col = (jsDay + 6) % 7

    if (col === 0 && hasStartedWeek) {
      weeks.push([...week])
      week = new Array(7).fill(null)
    }

    const idx = byDay.get(d)
    const isWeekend = col >= 5

    if (idx !== undefined) {
      week[col] = { type: 'data', idx, day: days[idx] }
    } else if (isWeekend) {
      week[col] = { type: 'empty-weekend', dd: d }
    }
    hasStartedWeek = true
  }

  if (hasStartedWeek) weeks.push([...week])
  return weeks
}

function dataCellClasses(status: DayResult['status'], selected: boolean): string {
  const base = [
    'relative flex items-center justify-center w-14 h-14 rounded-xl border',
    'cursor-pointer transition-all duration-100 hover:scale-105 text-sm font-semibold select-none',
  ].join(' ')

  const byStatus: Record<string, string> = {
    error: 'bg-red-950/50 text-red-300 border-red-700/50',
    warning: 'bg-indigo-950/40 text-indigo-300 border-indigo-700/40',
    info: 'bg-indigo-950/25 text-indigo-400/70 border-indigo-700/30',
    r0: 'bg-amber-950/30 text-amber-400 border-amber-700/40',
    ok: 'bg-slate-900/80 text-slate-400 border-slate-700/30',
    r4: 'bg-purple-950/40 text-purple-300 border-purple-700/50',
  }

  const selRing: Record<string, string> = {
    error: 'ring-2 ring-red-500/80 ring-offset-1 ring-offset-slate-800',
    warning: 'ring-2 ring-indigo-500/80 ring-offset-1 ring-offset-slate-800',
    info: 'ring-2 ring-indigo-400/80 ring-offset-1 ring-offset-slate-800',
    r0: 'ring-2 ring-amber-500/80 ring-offset-1 ring-offset-slate-800',
    ok: 'ring-2 ring-slate-400/80 ring-offset-1 ring-offset-slate-800',
    r4: 'ring-2 ring-purple-400/80 ring-offset-1 ring-offset-slate-800',
  }

  const statusCls = byStatus[status] ?? byStatus.ok
  const ringCls = selected ? (selRing[status] ?? selRing.ok) : ''
  return `${base} ${statusCls} ${ringCls}`.trim()
}

const CAL_HEADERS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'] as const

function CalendarHeatmap({
  days,
  selectedIdx,
  onSelect,
}: Readonly<{
  days: DayResult[]
  selectedIdx: number | null
  onSelect: (idx: number | null) => void
}>) {
  const grid = buildCalendarGrid(days)

  return (
    <div className="flex-shrink-0">
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {CAL_HEADERS.map((h) => (
          <div
            key={h}
            className="w-14 text-center text-[0.6rem] uppercase tracking-wide text-slate-600"
          >
            {h}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        {grid.map((week) => {
          const weekId =
            week.find((c) => c?.type === 'data')?.day.date ??
            week.find((c) => c?.type === 'empty-weekend')?.dd.toString() ??
            'filler'
          return (
            <div key={weekId} className="grid grid-cols-7 gap-1.5">
              {week.map((cell, ci) => {
                if (!cell) return <div key={CAL_HEADERS[ci]} className="w-14 h-14" />

                if (cell.type === 'empty-weekend') {
                  return (
                    <div
                      key={`weekend-${cell.dd}`}
                      className="w-14 h-14 rounded-xl flex items-center justify-center text-sm font-medium text-slate-700 bg-slate-900/20 border border-slate-800/30"
                    >
                      {cell.dd}
                    </div>
                  )
                }

                const { idx, day } = cell
                const selected = idx === selectedIdx
                const hasIssues = day.rules.length > 0

                return (
                  <button
                    key={`day-${day.date}`}
                    className={dataCellClasses(day.status, selected)}
                    onClick={() => onSelect(selected ? null : idx)}
                    title={
                      hasIssues
                        ? day.rules.map((r: string) => RULE_LABELS[r] ?? r).join(', ')
                        : 'OK'
                    }
                  >
                    <span>{Number.parseInt(day.date.substring(0, 2), 10)}</span>
                    {hasIssues && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayDetailPanel({
  days,
  issues,
  selectedIdx,
  onNavigate,
}: Readonly<{
  days: DayResult[]
  issues: Issue[]
  selectedIdx: number | null
  onNavigate: (idx: number) => void
}>) {
  const issueDayIdxs = days.map((d, i) => (d.rules.length > 0 ? i : -1)).filter((i) => i >= 0)

  if (selectedIdx === null) {
    return (
      <div className="flex-1 bg-slate-900/60 rounded-lg border border-slate-700/40 flex items-center justify-center min-h-[200px]">
        <p className="text-xs text-slate-400 text-center px-4">
          ← Clique num dia para ver os detalhes
        </p>
      </div>
    )
  }

  const day = days[selectedIdx]
  if (!day) return null

  const dayIssues = issues.filter((iss) => iss.date === day.date)
  const wday = weekdayName(day.date)

  const errPos = issueDayIdxs.indexOf(selectedIdx)
  const prevErr = errPos > 0 ? issueDayIdxs[errPos - 1] : -1
  const nextErr = errPos >= 0 && errPos < issueDayIdxs.length - 1 ? issueDayIdxs[errPos + 1] : -1
  const prevAny = selectedIdx > 0 ? selectedIdx - 1 : -1
  const nextAny = selectedIdx < days.length - 1 ? selectedIdx + 1 : -1

  return (
    <div className="flex-1 bg-slate-900/60 rounded-lg border border-slate-700/40 p-3 flex flex-col gap-3 min-h-[200px]">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-slate-200">
          {day.date.substring(0, 5)}
          <span className="text-slate-500 font-normal text-xs ml-1.5">· {wday}</span>
        </span>
        {day.holiday_name && (
          <span className="text-[0.65rem] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/25 px-1.5 py-0.5 rounded leading-none">
            {day.holiday_name}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(
          [
            { label: 'GA', value: fmtHours(day.ga), cls: undefined },
            { label: 'Task fat.', value: fmtHours(day.task), cls: undefined },
            {
              label: 'Diferença',
              value: `${day.diff > 0 ? '+' : ''}${fmtHours(day.diff)}`,
              cls: diffClass(day.diff),
            },
          ] as const
        ).map(({ label, value, cls }) => (
          <div key={label} className="bg-slate-800/60 rounded px-2 py-1.5">
            <p className="text-[0.65rem] text-slate-500 uppercase tracking-wide">{label}</p>
            <p className={`text-sm font-bold mt-0.5 ${cls ?? 'text-slate-200'}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex-1">
        {dayIssues.length === 0 ? (
          <div className="flex items-center gap-1.5 py-1">
            <CheckCircle size={13} className="text-emerald-500 shrink-0" />
            <p className="text-xs text-slate-400">Nenhuma inconsistência neste dia</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {dayIssues.map((iss) => {
              const dotCls = RULE_DOT_COLOR[iss.rule] ?? 'bg-slate-400'
              return (
                <div key={`${iss.date}-${iss.rule}`} className="flex gap-2 items-start">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${dotCls}`} />
                  <div>
                    <div className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                      <RuleBadge rule={iss.rule} />
                      {RULE_LABELS[iss.rule] ?? iss.rule}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{iss.message}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1">
        {(
          [
            { label: '← erro ant.', idx: prevErr },
            { label: '← dia ant.', idx: prevAny },
            { label: 'próx. dia →', idx: nextAny },
            { label: 'próx. erro →', idx: nextErr },
          ] as const
        ).map(({ label, idx }) => (
          <button
            key={label}
            disabled={idx < 0}
            onClick={() => idx >= 0 && onNavigate(idx)}
            className="px-1.5 py-1 text-[0.7rem] rounded border border-slate-700/50 text-slate-400 hover:bg-slate-700/40 hover:text-slate-200 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function getOrCreateTooltip(chart: ChartJS): HTMLDivElement {
  const parent = chart.canvas.parentNode as HTMLElement
  let el = parent.querySelector<HTMLDivElement>('.gabi-tooltip')
  if (!el) {
    el = document.createElement('div')
    el.className = 'gabi-tooltip'
    Object.assign(el.style, {
      position: 'absolute',
      pointerEvents: 'none',
      transition: 'opacity 0.15s',
      zIndex: '50',
      opacity: '0',
    })
    parent.appendChild(el)
  }
  return el
}

function hasAppointment(d: DayResult): boolean {
  return d.ga > 0 || d.task > 0 || (d.task_nf ?? 0) > 0
}

function isEmptyNonWorkday(d: DayResult): boolean {
  if (hasAppointment(d)) return false
  if (d.is_holiday) return true
  const [dd, mm, yyyy] = d.date.split('/').map(Number)
  const dow = new Date(yyyy, mm - 1, dd).getDay()
  return dow === 0 || dow === 6
}

const GA_BAR_COLOR = 'rgba(99,102,241,0.88)'

export function PersonChart({ days }: Readonly<{ days: DayResult[] }>) {
  const mouseYRef = useRef(0)
  const chartContainerRef = useRef<HTMLDivElement>(null)

  const chartDays = days.filter((d) => !isEmptyNonWorkday(d))

  const labels = chartDays.map((d) => d.date.slice(0, 5))
  const maxVal = Math.max(...chartDays.map((d) => Math.max(d.ga, d.task + (d.task_nf ?? 0))), 8)
  const yMax = Math.max(12, Math.ceil(maxVal / 2) * 2 + 2)

  const RULE_BAND: Record<string, { fill: string; glow: string }> = {
    R1: { fill: 'rgba(239,68,68,0.18)', glow: 'rgba(239,68,68,0.70)' },
    R0: { fill: 'rgba(251,191,36,0.15)', glow: 'rgba(251,191,36,0.60)' },
    R4: { fill: 'rgba(167,139,250,0.15)', glow: 'rgba(167,139,250,0.60)' },
  }
  const RULE_PRIORITY = ['R1', 'R0', 'R4']

  const chartPlugin = {
    id: 'gabiChart',
    beforeDatasetsDraw(chart: ChartJS) {
      const ctx = chart.ctx
      const { chartArea, scales } = chart

      const tickWidth =
        chartDays.length > 1
          ? Math.abs(scales.x.getPixelForValue(1) - scales.x.getPixelForValue(0))
          : scales.x.width

      chartDays.forEach((day, i) => {
        const rule = RULE_PRIORITY.find((r) => day.rules.includes(r))
        if (!rule) return
        const band = RULE_BAND[rule]

        const centerX = scales.x.getPixelForValue(i)
        ctx.save()
        ctx.shadowBlur = 18
        ctx.shadowColor = band.glow
        ctx.fillStyle = band.fill
        ctx.fillRect(centerX - tickWidth / 2, chartArea.top, tickWidth, chartArea.height)
        ctx.restore()
      })
    },
    afterDatasetsDraw(chart: ChartJS) {
      const ctx = chart.ctx
      const { scales } = chart
      const yLine = scales.y.getPixelForValue(8)

      ctx.save()
      ctx.font = 'bold 10px system-ui,sans-serif'
      ctx.fillStyle = 'rgba(251,191,36,1)'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText('8h', scales.x.right + 4, yLine)
      ctx.restore()
    },
  }

  const data = {
    labels,
    datasets: [
      {
        type: 'bar' as const,
        label: 'GA',
        data: chartDays.map((d) => d.ga),
        backgroundColor: GA_BAR_COLOR,
        borderRadius: 3,
        stack: 'ga',
        order: 2,
      },
      {
        type: 'bar' as const,
        label: 'Task fat.',
        data: chartDays.map((d) => d.task),
        backgroundColor: 'rgba(52,211,153,0.70)',
        borderRadius: 3,
        stack: 'task',
        order: 3,
      },
      {
        type: 'bar' as const,
        label: 'Task não fat.',
        data: chartDays.map((d) => d.task_nf ?? 0),
        backgroundColor: 'rgba(100,116,139,0.65)',
        borderColor: 'rgba(100,116,139,0.80)',
        borderWidth: 1,
        borderRadius: 3,
        stack: 'task',
        order: 4,
      },
      {
        type: 'line' as const,
        label: 'Limite 8h',
        data: chartDays.map(() => 8),
        borderColor: 'rgba(251,191,36,0.85)',
        borderWidth: 1,
        pointRadius: 0,
        fill: false,
        tension: 0,
        order: 1,
      },
    ],
  }

  return (
    <div className="bg-slate-900 rounded-lg p-3 mb-4">
      <div
        ref={chartContainerRef}
        aria-hidden="true"
        style={{ height: 300, position: 'relative' }}
        onMouseMove={(e) => {
          const rect = chartContainerRef.current?.getBoundingClientRect()
          if (rect) mouseYRef.current = e.clientY - rect.top
        }}
      >
        <Bar
          data={data as unknown as ChartData<'bar'>}
          plugins={[chartPlugin as unknown as Plugin<'bar'>]}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: 28 } },
            interaction: { mode: 'index' as const, intersect: false },
            plugins: {
              legend: {
                labels: {
                  color: '#94a3b8',
                  font: { size: 11 },
                  usePointStyle: true,
                  pointStyleWidth: 16,
                  generateLabels(chart) {
                    const items = ChartJS.defaults.plugins.legend.labels.generateLabels(chart)
                    return items.map((item) =>
                      item.text === 'Limite 8h'
                        ? { ...item, pointStyle: 'line' as const, lineWidth: 1.5 }
                        : { ...item, pointStyle: 'rect' as const }
                    )
                  },
                },
              },
              tooltip: {
                enabled: false,
                external: (context) => {
                  const chart = context.chart
                  const tooltip = context.tooltip
                  const el = getOrCreateTooltip(chart)
                  if (tooltip.opacity === 0) {
                    el.style.opacity = '0'
                    return
                  }

                  const idx = tooltip.dataPoints[0]?.dataIndex
                  if (idx === undefined) return
                  const d = chartDays[idx]
                  if (!d) return

                  const swatches: Record<string, string> = {
                    GA: GA_BAR_COLOR,
                    'Task fat.': 'rgba(52,211,153,0.85)',
                    'Task não fat.': 'rgba(100,116,139,0.80)',
                  }

                  const dataRow = (label: string, value: string, color: string) =>
                    `<div style="display:grid;grid-template-columns:1fr auto;gap:20px;align-items:center;margin-bottom:3px;">
                    <span style="display:flex;align-items:center;gap:5px;color:#94a3b8;">
                      <span style="width:8px;height:8px;border-radius:2px;background:${color};display:inline-block;flex-shrink:0;"></span>${label}
                    </span>
                    <span style="font-variant-numeric:tabular-nums;text-align:right;color:#e2e8f0;">${value}</span>
                  </div>`

                  const totalRow = (label: string, value: string) =>
                    `<div style="display:grid;grid-template-columns:1fr auto;gap:20px;align-items:center;">
                    <span style="font-weight:600;color:#f1f5f9;">${label}</span>
                    <span style="font-variant-numeric:tabular-nums;text-align:right;font-weight:600;color:#34d399;">${value}</span>
                  </div>`

                  const rows = tooltip.dataPoints
                    .filter((dp) => dp.dataset.label !== 'Limite 8h')
                    .map((dp) =>
                      dataRow(
                        dp.dataset.label ?? '',
                        fmtHours(dp.parsed.y ?? 0),
                        swatches[dp.dataset.label ?? ''] ?? 'rgba(148,163,184,0.5)'
                      )
                    )
                    .join('')

                  const totalTask = d.task + (d.task_nf ?? 0)
                  const rulesHtml =
                    d.rules.length > 0
                      ? `<div style="margin-top:6px;padding-top:5px;border-top:1px solid rgba(51,65,85,0.5);display:flex;flex-direction:column;gap:3px;">${d.rules
                          .map((r) => {
                            const color = RULE_DOT_HEX[r] ?? '#94a3b8'
                            return `<div style="display:flex;align-items:center;gap:5px;font-size:11px;"><span style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block;"></span><span style="color:${color};">${RULE_LABELS[r] ?? r}</span></div>`
                          })
                          .join('')}</div>`
                      : ''

                  el.innerHTML = `
                  <div style="background:rgba(2,6,23,0.97);border:1px solid rgba(51,65,85,0.8);border-radius:8px;padding:9px 12px;min-width:190px;font-size:11px;box-shadow:0 4px 20px rgba(0,0,0,0.5);">
                    <div style="font-weight:600;color:#f8fafc;margin-bottom:7px;padding-bottom:6px;border-bottom:1px solid rgba(51,65,65,0.6);">${d.date}</div>
                    ${rows}
                    <div style="border-top:1px solid rgba(51,65,85,0.6);margin-top:6px;padding-top:5px;">${totalRow('Total Task', fmtHours(totalTask))}</div>
                    ${rulesHtml}
                  </div>`

                  const parent = chart.canvas.parentNode as HTMLElement
                  const canvasRect = chart.canvas.getBoundingClientRect()
                  const parentRect = parent.getBoundingClientRect()
                  const caretLeft = canvasRect.left - parentRect.left + tooltip.caretX

                  el.style.left = '0px'
                  el.style.top = '0px'
                  el.style.transform = 'none'
                  const elW = el.offsetWidth
                  const elH = el.offsetHeight

                  const left = Math.max(
                    4,
                    Math.min(caretLeft - elW / 2, parent.offsetWidth - elW - 4)
                  )
                  const mouseY = mouseYRef.current
                  const top = mouseY - elH - 10 < 4 ? mouseY + 20 : mouseY - elH - 10

                  el.style.left = `${left}px`
                  el.style.top = `${top}px`
                  el.style.opacity = '1'
                },
              },
            },
            scales: {
              x: {
                ticks: { color: '#64748b', font: { size: 9 }, maxRotation: 0 },
                grid: { color: '#1e293b' },
              },
              y: {
                max: yMax,
                ticks: { color: '#64748b', font: { size: 10 } },
                grid: { color: '#1e293b' },
              },
            },
          }}
        />
      </div>
    </div>
  )
}

function RuleChip({ rule, label }: Readonly<{ rule: string; label: string }>) {
  const Icon = RULE_ICON[rule]
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[0.72rem] font-medium ${CHIP_CLS[rule] ?? 'bg-slate-500/10 border-slate-500/30 text-slate-400'}`}
    >
      {Icon && <Icon size={12} strokeWidth={2.5} />}
      {label}
    </span>
  )
}

export function RuleBadge({ rule }: Readonly<{ rule: string }>) {
  const Icon = RULE_ICON[rule]
  return (
    <span
      className={`inline-flex items-center justify-center w-[22px] h-[22px] rounded-md mr-0.5 shrink-0 ${RULE_COLOR[rule] ?? 'bg-slate-600'}`}
      title={RULE_LABELS[rule] ?? rule}
    >
      {Icon && <Icon size={12} strokeWidth={2.5} className="text-white" />}
    </span>
  )
}

export function PersonCard({ person }: Readonly<{ person: Person }>) {
  const [open, setOpen] = useState(true)
  const [selectedDayIdx, setSelectedDayIdx] = useState<number | null>(null)
  const [tableOpen, setTableOpen] = useState(false)
  const presentRules = new Set(person.issues.map((i) => i.rule))
  const hasAnyError = person.errors_count > 0 || !person.mensal_ok

  function resolveBorderCls(): string {
    if (hasAnyError) return 'border-red-800'
    if (presentRules.has('R2')) return 'border-indigo-800'
    if (presentRules.has('R0')) return 'border-amber-800'
    if (presentRules.has('R4')) return 'border-purple-800'
    return 'border-slate-700'
  }

  const borderCls = resolveBorderCls()

  return (
    <div className={`border rounded-xl mb-3 overflow-hidden ${borderCls}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-slate-800 hover:bg-slate-700/60 transition-colors text-left"
      >
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-50 text-sm">{person.name}</p>
            <span className="text-[0.65rem] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 px-1.5 py-0.5 rounded leading-none">
              {person.month_label}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{person.task_id}</p>
        </div>
        <div className="flex items-center gap-3 ml-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-slate-500">GA / Task</p>
            <p className="text-sm font-semibold">
              {fmtHours(person.ga_total)}
              <span className="text-slate-600 mx-1">/</span>
              {fmtHours(person.task_total)}
            </p>
          </div>
          {person.errors_count > 0 && (
            <span className="bg-red-900 text-red-300 border border-red-800 text-xs font-bold px-2 py-0.5 rounded-full">
              {person.errors_count} erro{person.errors_count > 1 ? 's' : ''}
            </span>
          )}
          {person.warnings_count > 0 && (
            <span className="bg-amber-900 text-amber-300 border border-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">
              {person.warnings_count} av.
            </span>
          )}
          {person.issues_count === 0 && (
            <span className="bg-green-950 text-green-300 border border-green-800 text-xs font-bold px-2 py-0.5 rounded-full">
              OK
            </span>
          )}
          {open ? (
            <ChevronUp size={16} className="text-slate-500 shrink-0" />
          ) : (
            <ChevronDown size={16} className="text-slate-500 shrink-0" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-5 py-4 bg-slate-800/50 border-t border-slate-700">
          {(() => {
            const pct =
              person.monthly_limit > 0
                ? ((person.ga_total / person.monthly_limit) * 100).toFixed(1)
                : '0.0'
            let limiteCls: string
            if (person.mensal_ok) {
              limiteCls = Number.parseFloat(pct) > 90 ? 'text-amber-400' : 'text-green-400'
            } else {
              limiteCls = 'text-red-400'
            }
            return (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                  {[
                    { label: 'GA total', value: fmtHours(person.ga_total) },
                    { label: 'Task fat.', value: fmtHours(person.task_total) },
                    {
                      label: 'Diferença',
                      value: `${person.diff_total > 0 ? '+' : ''}${fmtHours(person.diff_total)}`,
                      cls: diffClass(person.diff_total),
                    },
                    {
                      label: 'Limite',
                      value: `${person.monthly_limit}h · ${pct}%`,
                      cls: limiteCls,
                    },
                    { label: 'Dias úteis', value: `${person.working_days}d` },
                  ].map(({ label, value, cls }) => (
                    <div key={label} className="bg-slate-900 rounded-lg px-3 py-2.5">
                      <p className="text-[0.6rem] text-slate-500 uppercase tracking-wide">
                        {label}
                      </p>
                      <p className={`text-base font-bold mt-0.5 ${cls ?? 'text-slate-50'}`}>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                {person.mensal_ok ? (
                  <div className="flex items-start gap-2.5 bg-green-950/60 border border-green-800/60 rounded-lg px-3.5 py-2.5 mb-4">
                    <CheckCircle size={14} className="text-green-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-green-300">
                        Limite mensal OK — GA {fmtHours(person.ga_total)} de {person.monthly_limit}h
                        · {pct}%
                      </p>
                      {person.warnings_count > 0 && (
                        <p className="text-[0.65rem] text-green-600 mt-0.5">
                          dias &gt;8h são observações
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5 bg-red-950/60 border border-red-800/60 rounded-lg px-3.5 py-2.5 mb-4">
                    <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-red-300">
                        Limite mensal EXCEDIDO — GA {fmtHours(person.ga_total)} de{' '}
                        {person.monthly_limit}h · {pct}%
                      </p>
                      <p className="text-[0.65rem] text-red-600 mt-0.5">Correção obrigatória</p>
                    </div>
                  </div>
                )}
              </>
            )
          })()}

          <PersonChart days={person.days} />

          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Calendário
            </p>
            <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
              <div className="overflow-x-auto flex-shrink-0">
                <CalendarHeatmap
                  days={person.days}
                  selectedIdx={selectedDayIdx}
                  onSelect={setSelectedDayIdx}
                />
              </div>
              <DayDetailPanel
                days={person.days}
                issues={person.issues}
                selectedIdx={selectedDayIdx}
                onNavigate={setSelectedDayIdx}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-x-2 gap-y-1.5 mb-4">
            {RULE_LEGEND.map(({ rule, label }) => (
              <RuleChip key={rule} rule={rule} label={label} />
            ))}
          </div>

          <div>
            <button
              onClick={() => setTableOpen((o) => !o)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-2 transition-colors"
            >
              {tableOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Tabela diária completa
            </button>
            {tableOpen && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      {['Data', 'GA', 'Task', 'Diff', 'Regras'].map((h) => (
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
                    {person.days.map((day) => (
                      <tr key={day.date} className={`${ROW_BG[day.status]} hover:brightness-110`}>
                        <td className="px-3 py-1.5 text-slate-400">{day.date}</td>
                        <td className="px-3 py-1.5 text-slate-300">{fmtHours(day.ga)}</td>
                        <td className="px-3 py-1.5 text-slate-300">{fmtHours(day.task)}</td>
                        <td className={`px-3 py-1.5 font-medium ${diffClass(day.diff)}`}>
                          {day.diff > 0 ? '+' : ''}
                          {fmtHours(day.diff)}
                        </td>
                        <td className="px-3 py-1.5">
                          {day.rules.map((r) => (
                            <RuleBadge key={r} rule={r} />
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
