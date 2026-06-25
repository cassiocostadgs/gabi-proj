import { useState } from 'react'
import { format, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'
import { CalendarIcon } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface Props {
  value: DateRange
  onChange: (range: DateRange) => void
}

function shortcuts(): { label: string; range: DateRange }[] {
  const today = new Date()
  const yesterday = subDays(today, 1)
  return [
    { label: 'Hoje', range: { from: today, to: today } },
    { label: 'Ontem', range: { from: yesterday, to: yesterday } },
    { label: 'Últimos 7 dias', range: { from: subDays(today, 6), to: today } },
  ]
}

export function DateRangePicker({ value, onChange }: Readonly<Props>) {
  const [open, setOpen] = useState(false)

  const isComplete = !!(value.from && value.to && value.from.getTime() !== value.to.getTime())

  let label: string
  if (isComplete) {
    label = `${format(value.from!, 'dd/MM/yyyy')} → ${format(value.to!, 'dd/MM/yyyy')}`
  } else if (value.from) {
    label = `${format(value.from, 'dd/MM/yyyy')} → …`
  } else {
    label = 'Selecione um período'
  }

  function handleSelect(range: DateRange | undefined) {
    onChange(range ?? { from: undefined, to: undefined })
    const complete = range?.from && range?.to && range.from.getTime() !== range.to.getTime()
    if (complete) setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={(isOpen) => setOpen(isOpen)}>
      <PopoverTrigger
        type="button"
        className="w-full flex items-center gap-2 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 hover:border-blue-500 focus:border-blue-500 focus:outline-none transition-colors"
      >
        <CalendarIcon size={15} className="text-slate-400 shrink-0" />
        <span className="flex-1 text-left">{label}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto bg-slate-900 border-slate-700 p-0">
        <div className="flex gap-1 p-2 border-b border-slate-700">
          {shortcuts().map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                onChange(s.range)
                setOpen(false)
              }}
              className="px-2.5 py-1 text-xs rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-50 transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>
        <Calendar
          mode="range"
          selected={value.from === undefined ? undefined : value}
          onSelect={handleSelect}
          defaultMonth={
            value.from
              ? new Date(value.from.getFullYear(), value.from.getMonth() - 1, 1)
              : new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
          }
          numberOfMonths={2}
          locale={ptBR}
          className="p-3"
        />
      </PopoverContent>
    </Popover>
  )
}
