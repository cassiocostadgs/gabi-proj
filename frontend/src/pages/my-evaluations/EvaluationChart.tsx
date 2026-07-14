import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import type { Plugin, TooltipItem } from 'chart.js'
import { Line } from 'react-chartjs-2'
import { competenciaShort } from '../../lib/format'
import type { ClientEvaluation } from '../../types'

ChartJS.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip)

const RAIL_X = 4
const RAIL_WIDTH = 6
const RAIL_MARGIN = 16 // reserved via layout.padding.left — keeps the rail clear of the y-axis tick labels

// Fixed reference bands (1-5 scale) drawn beside the y-axis so the score's
// status (good/warn/critical) reads at a glance without recoloring the line
// itself — recoloring points by status was tried and dropped: at this marker
// size the identity ring and the status fill can't coexist legibly.
const statusRailPlugin: Plugin<'line'> = {
  id: 'statusRail',
  afterDraw(chart) {
    const y = chart.scales.y
    if (!y) return
    const bands: Array<[number, number, string]> = [
      [5, 3.5, '#34d399'],
      [3.5, 2.5, '#fbbf24'],
      [2.5, 1, '#f87171'],
    ]
    const { ctx } = chart
    ctx.save()
    bands.forEach(([from, to, color]) => {
      const top = y.getPixelForValue(from)
      const bottom = y.getPixelForValue(to)
      ctx.fillStyle = color
      ctx.fillRect(RAIL_X, top, RAIL_WIDTH, bottom - top)
    })
    ctx.restore()
  },
}

const pointLabelsPlugin: Plugin<'line'> = {
  id: 'pointLabels',
  afterDatasetsDraw(chart) {
    const dataset = chart.data.datasets[0]
    const meta = chart.getDatasetMeta(0)
    const color = typeof dataset.borderColor === 'string' ? dataset.borderColor : '#e2e8f0'
    const { ctx } = chart
    ctx.save()
    ctx.font = '600 10px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    meta.data.forEach((point, index) => {
      const value = dataset.data[index] as number | null
      if (value == null) return
      ctx.fillText(String(value), point.x, point.y - 6)
    })
    ctx.restore()
  },
}

type DimensionKey = 'comportamental_nota' | 'tecnica_nota' | 'prazo_nota'

interface DimensionConfig {
  key: DimensionKey
  label: string
  color: string
}

const DIMENSIONS: DimensionConfig[] = [
  { key: 'comportamental_nota', label: 'Comportamental', color: '#3b82f6' },
  { key: 'tecnica_nota', label: 'Técnica', color: '#34d399' },
  { key: 'prazo_nota', label: 'Prazo', color: '#fb923c' },
]

interface DimensionChartProps {
  label: string
  color: string
  labels: string[]
  scores: Array<number | null>
  showXAxis: boolean
}

function DimensionChart({
  label,
  color,
  labels,
  scores,
  showXAxis,
}: Readonly<DimensionChartProps>) {
  const data = {
    labels,
    datasets: [
      {
        data: scores,
        borderColor: color,
        backgroundColor: color,
        pointBackgroundColor: color,
        pointBorderColor: '#0f172a',
        pointBorderWidth: 1.5,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.3,
        spanGaps: true,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { left: RAIL_MARGIN, top: 14, right: 8 } },
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (item: TooltipItem<'line'>) => `${label}: ${item.formattedValue}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { display: showXAxis, color: '#94a3b8', font: { size: 10 } },
      },
      y: {
        min: 1,
        max: 5,
        grid: { color: '#1e293b' },
        ticks: { color: '#94a3b8', stepSize: 1, font: { size: 10 } },
      },
    },
  }

  return (
    <div>
      <p className="text-xs font-semibold mb-1" style={{ color }}>
        {label}
      </p>
      <div style={{ height: showXAxis ? 130 : 110 }}>
        <Line data={data} options={options} plugins={[statusRailPlugin, pointLabelsPlugin]} />
      </div>
    </div>
  )
}

interface EvaluationChartProps {
  evaluations: ClientEvaluation[]
}

export function EvaluationChart({ evaluations }: Readonly<EvaluationChartProps>) {
  const labels = evaluations.map((item) => competenciaShort(item.competencia))

  return (
    <div className="space-y-3">
      {DIMENSIONS.map((dimension, index) => (
        <DimensionChart
          key={dimension.key}
          label={dimension.label}
          color={dimension.color}
          labels={labels}
          scores={evaluations.map((item) => item[dimension.key])}
          showXAxis={index === DIMENSIONS.length - 1}
        />
      ))}
    </div>
  )
}
