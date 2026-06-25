import { cn } from '../lib/utils'

interface SpinnerProps {
  fullscreen?: boolean
  size?: 'sm' | 'md'
}

export function Spinner({ fullscreen, size = 'md' }: Readonly<SpinnerProps>) {
  const spinner = (
    <span
      className={cn(
        'inline-block rounded-full border-2 border-white/20 border-t-white animate-spin',
        size === 'sm' ? 'w-4 h-4' : 'w-6 h-6'
      )}
    />
  )
  if (fullscreen) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">{spinner}</div>
    )
  }
  return spinner
}
