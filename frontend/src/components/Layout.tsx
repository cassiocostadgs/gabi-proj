import { NavLink, useNavigate } from 'react-router-dom'
import {
  LogOut,
  ClipboardCheck,
  FileSpreadsheet,
  Users,
  UserCheck,
  ClipboardList,
  Settings2,
  History,
} from 'lucide-react'
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
  { to: '/admin/team', icon: UserCheck, label: 'Equipe' },
  { to: '/admin/approvals', icon: ClipboardList, label: 'Aprovações' },
  { to: '/admin/settings', icon: Settings2, label: 'Configurações' },
]

const USER_NAV = [
  { to: '/validate', icon: ClipboardCheck, label: 'Validar' },
  { to: '/submissions', icon: History, label: 'Submissões' },
]

function UserAvatar({ email }: Readonly<{ email: string }>) {
  const name = displayName(email)
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
  return (
    <div className="w-7 h-7 rounded-full bg-blue-700/40 border border-blue-600/40 flex items-center justify-center shrink-0">
      <span className="text-xs font-semibold text-blue-200 leading-none">{initials}</span>
    </div>
  )
}

function Sidebar({
  nav,
  user,
  onLogout,
}: Readonly<{
  nav: typeof ADMIN_NAV
  user: { email?: string } | null
  onLogout: () => void
}>) {
  return (
    <aside className="hidden sm:flex sm:flex-col w-52 shrink-0 bg-slate-800/30 border-r border-slate-700 sticky top-0 h-screen overflow-y-auto">
      <div className="px-5 py-4 border-b border-slate-700 flex items-center gap-2">
        <GabiLogo size={28} />
        <span className="text-base font-bold text-slate-50 tracking-tight">GABI</span>
      </div>
      <nav className="flex-1 py-4 px-3 flex flex-col gap-1">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border ${
                isActive
                  ? 'bg-blue-700/20 text-blue-300 border-blue-700/40 border-l-2 border-l-blue-400'
                  : 'text-slate-400 border-transparent hover:bg-slate-700/50 hover:text-slate-200'
              }`
            }
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-3 py-4 border-t border-slate-700 flex flex-col gap-2">
        {user?.email && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 truncate">
            <UserAvatar email={user.email} />
            <span className="truncate">{displayName(user.email)}</span>
          </div>
        )}
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 transition-colors w-full"
        >
          <LogOut size={15} />
          Sair
        </button>
      </div>
    </aside>
  )
}

export function Layout({ children, title, subtitle, actions }: Readonly<LayoutProps>) {
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

  const mobileHeader = (onLogout: () => void) => (
    <header className="sm:hidden sticky top-0 z-10 bg-slate-800 border-b border-slate-700 px-5 py-3.5 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2">
        <GabiLogo size={28} />
        <span className="text-base font-bold text-slate-50 tracking-tight">GABI</span>
        <span
          className={`w-2 h-2 rounded-full shrink-0 ml-0.5 ${
            oracleAvailable
              ? 'bg-emerald-400 shadow-[0_0_0_2px_rgba(16,185,129,0.22)]'
              : 'bg-amber-400 shadow-[0_0_0_2px_rgba(234,179,8,0.22)]'
          }`}
          title={oracleAvailable ? 'Task DB · conectado' : 'Task DB · indisponível'}
        />
      </div>
      <button
        onClick={onLogout}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-slate-400 border border-slate-600 hover:bg-slate-700 transition-colors"
      >
        <LogOut size={13} />
        Sair
      </button>
    </header>
  )

  const contentHeader = (title || subtitle || actions) && (
    <header className="sticky top-0 z-10 bg-slate-800 border-b border-slate-700 shadow-[0_1px_0_theme(colors.slate.700)] px-6 py-3.5 flex items-center justify-between gap-4 flex-wrap shrink-0">
      <div>
        {title && <p className="text-sm font-semibold text-slate-100">{title}</p>}
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </header>
  )

  if (user?.is_admin) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col sm:flex-row">
        {mobileHeader(handleLogout)}
        <Sidebar nav={ADMIN_NAV} user={user} onLogout={handleLogout} />
        <div className="flex-1 flex flex-col min-w-0">
          {contentHeader}
          <main>{children}</main>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col sm:flex-row">
      {mobileHeader(handleLogout)}
      <Sidebar nav={USER_NAV} user={user} onLogout={handleLogout} />
      <div className="flex-1 flex flex-col min-w-0">
        {contentHeader}
        <main>{children}</main>
      </div>
    </div>
  )
}
