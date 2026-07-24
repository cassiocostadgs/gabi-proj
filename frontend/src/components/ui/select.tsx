import { Select as SelectPrimitive } from '@base-ui/react/select'
import { ChevronDown, Check } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
}

interface SelectFieldProps {
  id?: string
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  required?: boolean
  disabled?: boolean
  variant?: 'default' | 'compact'
}

export function SelectField({
  id,
  value,
  onValueChange,
  options,
  placeholder = 'Selecione...',
  required,
  disabled,
  variant = 'default',
}: Readonly<SelectFieldProps>) {
  const isCompact = variant === 'compact'
  const valueColor = value ? 'text-slate-50' : 'text-slate-500'
  const sharedTrigger =
    'w-full flex items-center justify-between border border-slate-600 outline-none transition-colors hover:border-slate-500 data-[popup-open]:border-indigo-500 focus-visible:border-indigo-500'
  const triggerCls = isCompact
    ? `${sharedTrigger} bg-slate-800 rounded px-2 py-1 text-xs ${valueColor}`
    : `${sharedTrigger} bg-slate-900 rounded-lg px-3 py-2 text-sm ${valueColor}`

  return (
    <SelectPrimitive.Root
      items={options}
      value={value || null}
      onValueChange={(val) => onValueChange((val as string) ?? '')}
      required={required}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger id={id} className={triggerCls}>
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown size={isCompact ? 12 : 14} className="text-slate-500 shrink-0 ml-2" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          sideOffset={4}
          alignItemWithTrigger={false}
          style={{ minWidth: 'var(--anchor-width)' }}
          className="z-50"
        >
          <SelectPrimitive.Popup className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 outline-none overflow-hidden">
            <SelectPrimitive.List>
              {options.map((opt) => (
                <SelectPrimitive.Item
                  key={opt.value}
                  value={opt.value}
                  className="flex items-center justify-between px-3 py-2 text-sm text-slate-200 cursor-pointer outline-none data-[highlighted]:bg-slate-700/60 data-[selected]:text-indigo-300"
                >
                  <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator>
                    <Check size={12} className="text-indigo-400 shrink-0 ml-3" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
