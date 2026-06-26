import { ChevronLeft, ChevronRight } from 'lucide-react'

const MONTH_ABBR = [
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

interface MonthPickerProps {
  pickerYear: number
  selectedCompetencia: string
  onYearChange: (delta: number) => void
  onMonthSelect: (competencia: string) => void
}

export function MonthPicker({
  pickerYear,
  selectedCompetencia,
  onYearChange,
  onMonthSelect,
}: Readonly<MonthPickerProps>) {
  const parts = selectedCompetencia.split('-')
  const selYear = parts[0] ? Number.parseInt(parts[0], 10) : null
  const selMonth = parts[1] ? Number.parseInt(parts[1], 10) : null

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => onYearChange(-1)}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-slate-200">{pickerYear}</span>
        <button
          onClick={() => onYearChange(1)}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {MONTH_ABBR.map((abbr, i) => {
          const monthNum = i + 1
          const isSelected = selYear === pickerYear && selMonth === monthNum
          return (
            <button
              key={abbr}
              onClick={() => {
                onMonthSelect(`${pickerYear}-${String(monthNum).padStart(2, '0')}`)
              }}
              className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isSelected
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              {abbr}
            </button>
          )
        })}
      </div>
    </div>
  )
}
