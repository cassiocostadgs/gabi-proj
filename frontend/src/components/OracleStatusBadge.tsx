interface OracleStatusBadgeProps {
  available: boolean
  className?: string
}

export function OracleStatusBadge({ available, className = '' }: Readonly<OracleStatusBadgeProps>) {
  const badgeClass = available
    ? 'border-emerald-500/25 bg-emerald-500/6 text-slate-400'
    : 'border-amber-500/30 bg-amber-500/8 text-amber-400'
  const dotClass = available
    ? 'bg-emerald-400 shadow-[0_0_0_2px_rgba(16,185,129,0.22)]'
    : 'bg-amber-400 shadow-[0_0_0_2px_rgba(234,179,8,0.22)]'

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium ${badgeClass} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
      {available ? 'Task DB · conectado' : 'Task DB · indisponível'}
    </div>
  )
}
