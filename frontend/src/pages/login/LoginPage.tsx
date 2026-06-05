import { useState, FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Spinner } from '../../components/Spinner'
import axios from 'axios'

export function LoginPage() {
  const { login, user, loading } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <Spinner fullscreen />
  if (user) return <Navigate to={user.is_admin ? '/admin/task' : '/validate'} replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const loggedUser = await login(username + '@db1.com.br', password)
      navigate(loggedUser?.is_admin ? '/admin/task' : '/validate', { replace: true })
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        setError('E-mail ou senha incorretos.')
      } else {
        setError('Erro ao conectar. Tente novamente.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-blue-400 tracking-tight">G.A.B.I.</h1>
          <p className="text-xs text-slate-500 mt-1">Gap Auditor of Billed Input</p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8">
          <h2 className="text-base font-semibold text-slate-50 mb-1">Entrar</h2>
          <p className="text-xs text-slate-500 mb-6">Use seu e-mail corporativo DB1</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                E-mail
              </label>
              <div className="flex items-center bg-slate-900 border border-slate-600 rounded-lg focus-within:border-blue-500 transition-colors overflow-hidden">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="pedro.santos"
                  autoComplete="username"
                  required
                  className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-slate-50 placeholder-slate-600 outline-none"
                />
                <span className="px-3 py-2.5 text-sm text-slate-400 bg-slate-800/80 border-l border-slate-600 select-none whitespace-nowrap font-medium">
                  @db1.com.br
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-50 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {error && <p className="text-xs text-red-400 text-center">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-700 hover:bg-blue-600 disabled:bg-blue-900 disabled:text-blue-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Spinner size="sm" /> Entrando…
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
