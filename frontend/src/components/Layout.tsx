import { Link, NavLink, useNavigate } from 'react-router-dom'
import { LogOut, ClipboardCheck, FileSpreadsheet, Users, User } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { GabiLogo } from './GabiLogo'
import { validateService } from '../services/validate.service'

function displayName(email: string): string {
  const prefix = email.split('@')[0] ?? email
  return prefix
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

interface LayoutProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
  actions?: React.ReactNode
}

const ADMIN_NAV = [
  { to: '/validate', icon: ClipboardCheck, label: 'Validar' },
  { to: '/admin/task', icon: FileSpreadsheet, label: 'Relatório Task' },
  { to: '/admin/users', icon: Users, label: 'Usuários' },
]

export function Layout({ children, title, subtitle, actions }: LayoutProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const { data: oracleAvailable = false } = useQuery({
    queryKey: ['oracle-status'],
    queryFn: validateService.getOracleStatus,
    refetchInterval: 30_000,
  })

  if (user?.is_admin) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col sm:flex-row">
        {/* Mobile header */}
        <header className="sm:hidden sticky top-0 z-10 bg-slate-800 border-b border-slate-700 px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <GabiLogo size={28} />
            <span className="text-base font-bold text-slate-50 tracking-tight">GABI</span>
          </div>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-slate-400 border border-slate-600 hover:bg-slate-700 transition-colors"
          >
            <LogOut size={13} />
            Sair
          </button>
        </header>

        {/* Sidebar — sm+ */}
        <aside className="hidden sm:flex sm:flex-col w-52 shrink-0 bg-slate-800/30 border-r border-slate-700 min-h-screen">
          <div className="px-5 py-4 border-b border-slate-700 flex items-center gap-2">
            <GabiLogo size={28} />
            <span className="text-base font-bold text-slate-50 tracking-tight">GABI</span>
          </div>
          <nav className="flex-1 py-4 px-3 flex flex-col gap-1">
            {ADMIN_NAV.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border ${
                    isActive
                      ? 'bg-blue-700/20 text-blue-300 border-blue-700/40'
                      : 'text-slate-400 border-transparent hover:bg-slate-700/50 hover:text-slate-200'
                  }`
                }
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="px-3 py-4 border-t border-slate-700 flex flex-col gap-1">
            {user?.email && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500 truncate">
                <User size={13} className="shrink-0" />
                <span className="truncate">{displayName(user.email)}</span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 transition-colors w-full"
            >
              <LogOut size={15} />
              Sair
            </button>
          </div>
        </aside>

        {/* Content area */}
        <div className="flex-1 flex flex-col min-w-0">
          {(title || subtitle || actions) && (
            <header className="sticky top-0 z-10 bg-slate-800 border-b border-slate-700 px-6 py-3.5 flex items-center justify-between gap-4 flex-wrap shrink-0">
              <div>
                {title && <p className="text-sm font-semibold text-slate-300">{title}</p>}
                {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
              </div>
              {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
            </header>
          )}
          <main>{children}</main>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="sticky top-0 z-10 bg-slate-800 border-b border-slate-700 px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/validate" className="flex items-center gap-3 leading-none shrink-0">
          <GabiLogo size={32} />
          <div className="flex flex-col gap-px">
            <span className="text-sm font-bold tracking-wide text-slate-50 leading-none">GABI</span>
            <span className="text-[10px] text-slate-500 leading-none tracking-wide">
              Gap Auditor of Billed Input
            </span>
          </div>
        </Link>

        {/* DB status pill — center */}
        <div className="flex-1 flex justify-center">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
              oracleAvailable
                ? 'border-emerald-500/25 bg-emerald-500/6 text-slate-400'
                : 'border-amber-500/28 bg-amber-500/6 text-amber-400'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                oracleAvailable
                  ? 'bg-emerald-400 shadow-[0_0_0_2px_rgba(16,185,129,0.22)]'
                  : 'bg-amber-400 shadow-[0_0_0_2px_rgba(234,179,8,0.22)]'
              }`}
            />
            {oracleAvailable ? 'Task DB · conectado' : 'Task DB · indisponível'}
          </div>
        </div>

        {/* Actions + User + Sair */}
        <div className="flex items-center gap-3 shrink-0">
          {actions && <div className="flex items-center gap-2">{actions}</div>}
          {user?.email && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-500">
              <User size={12} />
              {displayName(user.email)}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-slate-200 transition-colors"
          >
            <LogOut size={13} />
            Sair
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
