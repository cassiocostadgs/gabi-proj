import { useState } from 'react'
import { createPortal } from 'react-dom'
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
  KeyRound,
  Table2,
  X,
  Eye,
  EyeOff,
  Star,
  Layers,
  IdCard,
  MessageSquareText,
} from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { useElementHeight } from '../hooks/useElementHeight'
import { GabiLogo } from './GabiLogo'
import { validateService } from '../services/validate.service'
import { authService } from '../services/auth.service'

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
  { to: '/admin/task-entries', icon: Table2, label: 'Task do Time' },
  { to: '/admin/users', icon: Users, label: 'Usuários' },
  { to: '/admin/team', icon: UserCheck, label: 'Equipe' },
  { to: '/admin/approvals', icon: ClipboardList, label: 'Aprovações' },
  { to: '/admin/avaliacao-cliente', icon: Star, label: 'Avaliações MAG' },
  { to: '/admin/squads', icon: Layers, label: 'Squads' },
  { to: '/admin/tl-roles', icon: IdCard, label: 'Papéis' },
  { to: '/admin/tl-prompt-settings', icon: MessageSquareText, label: 'Prompt Avaliação TL' },
  { to: '/admin/settings', icon: Settings2, label: 'Configurações' },
]

const USER_NAV = [
  { to: '/validate', icon: ClipboardCheck, label: 'Validar' },
  { to: '/task-report', icon: Table2, label: 'Meu Task' },
  { to: '/submissions', icon: History, label: 'Submissões' },
  { to: '/minhas-avaliacoes', icon: Star, label: 'Minhas Avaliações' },
  { to: '/tl/squads', icon: Layers, label: 'Meus Squads' },
]

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
}: Readonly<{
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggle: () => void
}>) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-400">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 pr-9 focus:outline-none focus:border-blue-500"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={onToggle}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  )
}

function ChangePasswordModal({ onClose }: Readonly<{ onClose: () => void }>) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const mutation = useMutation({
    mutationFn: () => authService.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setSuccess(true)
      setTimeout(onClose, 2000)
    },
    onError: () => setError('Senha atual incorreta.'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (newPassword.length < 6) {
      setError('A nova senha deve ter no mínimo 6 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }
    mutation.mutate()
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-slate-100">Alterar senha</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        {success ? (
          <p className="text-sm text-emerald-400 text-center py-4">Senha alterada com sucesso.</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <PasswordField
              label="Senha atual"
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showCurrent}
              onToggle={() => setShowCurrent((v) => !v)}
            />
            <PasswordField
              label="Nova senha"
              value={newPassword}
              onChange={setNewPassword}
              show={showNew}
              onToggle={() => setShowNew((v) => !v)}
            />
            <PasswordField
              label="Confirmar nova senha"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirm}
              onToggle={() => setShowConfirm((v) => !v)}
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={mutation.isPending}
              className="mt-1 w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors disabled:opacity-50"
            >
              {mutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body
  )
}

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
  const [showPasswordModal, setShowPasswordModal] = useState(false)

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
          <button
            onClick={() => setShowPasswordModal(true)}
            title="Alterar senha"
            className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 rounded-lg hover:bg-slate-700/50 hover:text-slate-200 transition-colors w-full group"
          >
            <UserAvatar email={user.email} />
            <span className="truncate flex-1 text-left">{displayName(user.email)}</span>
            <KeyRound
              size={12}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </button>
        )}
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 transition-colors w-full"
        >
          <LogOut size={15} />
          Sair
        </button>
      </div>
      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
    </aside>
  )
}

export function Layout({ children, title, subtitle, actions }: Readonly<LayoutProps>) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileHeaderRef, mobileHeaderHeight] = useElementHeight<HTMLElement>()
  const [contentHeaderRef, contentHeaderHeight] = useElementHeight<HTMLElement>()
  const totalHeaderHeight = mobileHeaderHeight + contentHeaderHeight

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
    <header
      ref={mobileHeaderRef}
      className="sm:hidden sticky top-0 z-20 bg-slate-800 border-b border-slate-700 px-5 py-3.5 flex items-center justify-between shrink-0"
    >
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
    <header
      ref={contentHeaderRef}
      style={{ top: mobileHeaderHeight }}
      className="sticky z-10 bg-slate-800 border-b border-slate-700 shadow-[0_1px_0_theme(colors.slate.700)] px-6 py-3.5 flex items-center justify-between gap-4 flex-wrap shrink-0"
    >
      <div>
        {title && <p className="text-sm font-semibold text-slate-100">{title}</p>}
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </header>
  )

  const stickyOffsetStyle = {
    '--gabi-header-offset': `${totalHeaderHeight}px`,
  } as React.CSSProperties

  if (user?.is_admin) {
    return (
      <div
        className="min-h-screen bg-slate-900 flex flex-col sm:flex-row"
        style={stickyOffsetStyle}
      >
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
    <div className="min-h-screen bg-slate-900 flex flex-col sm:flex-row" style={stickyOffsetStyle}>
      {mobileHeader(handleLogout)}
      <Sidebar nav={USER_NAV} user={user} onLogout={handleLogout} />
      <div className="flex-1 flex flex-col min-w-0">
        {contentHeader}
        <main>{children}</main>
      </div>
    </div>
  )
}
