import { useState, FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import axios from 'axios'

import { useAuth } from '../../hooks/useAuth'
import { Spinner } from '../../components/Spinner'

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true" className="flex-shrink-0">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}

export function LoginPage() {
  const { login, user, loading } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
    <div
      className="relative w-screen h-screen overflow-hidden flex"
      style={{ background: '#07101e' }}
    >
      {/* Fundo: dois blooms estáticos e sutis */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          style={{
            position: 'absolute',
            top: '-20%',
            left: '-10%',
            width: 800,
            height: 800,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(79,110,247,.12) 0%, transparent 60%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-15%',
            right: '30%',
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(124,58,237,.09) 0%, transparent 60%)',
            filter: 'blur(60px)',
          }}
        />
      </div>

      {/* Layout — máx 1360px centrado */}
      <div className="relative z-10 flex w-full justify-center">
        <div
          className="grid w-full h-screen"
          style={{ gridTemplateColumns: '1fr 480px', maxWidth: 1360 }}
        >
          {/* ── Brand side ── */}
          <div className="flex flex-col items-start justify-center px-16">
            {/* Conteúdo centralizado verticalmente */}
            <div className="flex flex-col">
              {/* Logo — aumentada + hover */}
              <div
                className="mb-8 cursor-default"
                style={{ width: 'fit-content' }}
                onMouseEnter={(e) => {
                  const svg = e.currentTarget.querySelector('svg') as SVGElement
                  svg.style.transform = 'scale(1.1) translateY(-4px)'
                  svg.style.filter =
                    'drop-shadow(0 16px 40px rgba(109,40,217,.7)) drop-shadow(0 0 20px rgba(249,115,22,.3))'
                }}
                onMouseLeave={(e) => {
                  const svg = e.currentTarget.querySelector('svg') as SVGElement
                  svg.style.transform = 'scale(1) translateY(0)'
                  svg.style.filter = 'drop-shadow(0 8px 28px rgba(109,40,217,.5))'
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 200 200"
                  width="112"
                  height="112"
                  style={{
                    filter: 'drop-shadow(0 8px 28px rgba(109,40,217,.5))',
                    transition: 'transform .35s cubic-bezier(.34,1.56,.64,1), filter .35s ease',
                    display: 'block',
                  }}
                >
                  <defs>
                    <linearGradient id="lg-side" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#6D28D9" />
                      <stop offset="100%" stopColor="#4C1D95" />
                    </linearGradient>
                    <linearGradient id="lg-top" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#8B5CF6" />
                      <stop offset="100%" stopColor="#6D28D9" />
                    </linearGradient>
                  </defs>
                  <path d="M 100 40 L 155 70 L 100 100 L 45 70 Z" fill="url(#lg-top)" />
                  <path d="M 45 70 L 100 100 L 100 160 L 45 130 Z" fill="url(#lg-side)" />
                  <path
                    d="M 100 100 L 155 70 L 155 130 L 100 160 Z"
                    fill="url(#lg-side)"
                    opacity="0.85"
                  />
                  <g
                    fill="none"
                    stroke="#F97316"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M 127.5 85 L 100 70 L 72.5 85 L 72.5 115 L 100 130 L 127.5 115 L 100 100" />
                  </g>
                  <circle cx="100" cy="100" r="5" fill="#F97316" />
                </svg>
              </div>

              {/* Nome */}
              <div
                className="mb-1"
                style={{
                  color: 'rgba(255,255,255,.22)',
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                }}
              >
                DB1 Group
              </div>
              <h1
                className="font-extrabold tracking-[-0.04em] leading-[1.0] mb-6"
                style={{ fontSize: 80, color: 'rgba(255,255,255,.92)' }}
              >
                G.A.B.I.
              </h1>

              {/* Tagline — visível mas não competindo */}
              <p
                style={{
                  fontSize: 17,
                  color: 'rgba(255,255,255,.38)',
                  fontWeight: 300,
                  lineHeight: 1.6,
                  letterSpacing: '-.01em',
                }}
              >
                Cada hora,{' '}
                <span style={{ color: 'rgba(255,255,255,.72)', fontWeight: 400 }}>
                  no lugar certo.
                </span>
              </p>

              {/* Acento laranja — próximo da tagline */}
              <div
                className="mt-6"
                style={{
                  width: 28,
                  height: 2,
                  borderRadius: 2,
                  background: 'linear-gradient(90deg, #f97316, #fb923c)',
                  opacity: 0.75,
                }}
              />
            </div>
          </div>

          {/* ── Form side ── */}
          <div
            className="flex items-center justify-center px-10 py-10"
            style={{ borderLeft: '1px solid rgba(255,255,255,.08)' }}
          >
            <div
              className="w-full rounded-2xl px-8 py-9"
              style={{
                maxWidth: 400,
                background: 'rgba(255,255,255,.03)',
                border: '1px solid rgba(255,255,255,.06)',
              }}
            >
              {/* Header */}
              <div className="mb-8">
                <h2
                  className="font-semibold mb-1.5"
                  style={{ fontSize: 22, color: 'rgba(255,255,255,.9)', letterSpacing: '-.02em' }}
                >
                  Entrar
                </h2>
                <p className="text-[13px]" style={{ color: 'rgba(255,255,255,.3)' }}>
                  Use seu e-mail corporativo DB1
                </p>
              </div>

              {/* MS 365 */}
              <button
                type="button"
                className="w-full flex items-center justify-center gap-3 rounded-xl py-3 px-4 text-[13px] font-medium mb-6 transition-all"
                style={{
                  color: 'rgba(255,255,255,.75)',
                  background: 'rgba(255,255,255,.05)',
                  border: '1px solid rgba(255,255,255,.09)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,.09)'
                  e.currentTarget.style.color = 'rgba(255,255,255,.95)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,.15)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,.05)'
                  e.currentTarget.style.color = 'rgba(255,255,255,.75)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,.09)'
                }}
              >
                <MicrosoftIcon />
                Continuar com Microsoft 365
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-6">
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,.06)' }} />
                <span
                  className="text-[11px] font-medium tracking-[.06em]"
                  style={{ color: 'rgba(255,255,255,.2)' }}
                >
                  ou
                </span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,.06)' }} />
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {/* Email */}
                <div>
                  <label
                    className="block text-[11px] font-semibold tracking-[.08em] uppercase mb-1.5"
                    style={{ color: 'rgba(255,255,255,.3)' }}
                  >
                    E-mail
                  </label>
                  <div
                    className="flex overflow-hidden rounded-xl transition-all"
                    style={{
                      border: '1px solid rgba(255,255,255,.08)',
                      background: 'rgba(255,255,255,.04)',
                    }}
                    onFocusCapture={(e) =>
                      (e.currentTarget.style.borderColor = 'rgba(79,110,247,.7)')
                    }
                    onBlurCapture={(e) =>
                      (e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)')
                    }
                  >
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="pedro.santos"
                      autoComplete="username"
                      required
                      className="flex-1 min-w-0 py-3 pl-4 pr-2 text-[14px] outline-none bg-transparent"
                      style={{ color: 'rgba(255,255,255,.85)', caretColor: '#4f6ef7' }}
                    />
                    <div
                      className="flex items-center pl-3 pr-4 text-[13px] whitespace-nowrap select-none flex-shrink-0"
                      style={{
                        color: 'rgba(255,255,255,.25)',
                        borderLeft: '1px solid rgba(255,255,255,.06)',
                      }}
                    >
                      @db1.com.br
                    </div>
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label
                    className="block text-[11px] font-semibold tracking-[.08em] uppercase mb-1.5"
                    style={{ color: 'rgba(255,255,255,.3)' }}
                  >
                    Senha
                  </label>
                  <div
                    className="flex items-center overflow-hidden rounded-xl transition-all"
                    style={{
                      border: '1px solid rgba(255,255,255,.08)',
                      background: 'rgba(255,255,255,.04)',
                    }}
                    onFocusCapture={(e) =>
                      (e.currentTarget.style.borderColor = 'rgba(79,110,247,.7)')
                    }
                    onBlurCapture={(e) =>
                      (e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)')
                    }
                  >
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                      className="flex-1 min-w-0 py-3 pl-4 pr-2 text-[14px] outline-none bg-transparent"
                      style={{ color: 'rgba(255,255,255,.85)', caretColor: '#4f6ef7' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="flex items-center px-4 py-3 transition-colors flex-shrink-0"
                      style={{
                        color: 'rgba(255,255,255,.25)',
                        borderLeft: '1px solid rgba(255,255,255,.06)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,.55)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,.25)')}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <div className="flex justify-end mt-2">
                    <a
                      href="#"
                      className="text-[12px] transition-colors"
                      style={{ color: 'rgba(79,110,247,.7)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(79,110,247,1)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(79,110,247,.7)')}
                    >
                      Esqueci a senha
                    </a>
                  </div>
                </div>

                {error && (
                  <p className="text-[12px] text-center" style={{ color: 'rgba(248,113,113,.85)' }}>
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full mt-1 rounded-xl py-3.5 text-[14px] font-semibold text-white relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #3b5bdb 0%, #6741d9 100%)',
                    boxShadow:
                      '0 4px 20px rgba(59,91,219,.35), 0 1px 0 rgba(255,255,255,.12) inset',
                  }}
                  onMouseEnter={(e) => {
                    if (!submitting)
                      e.currentTarget.style.boxShadow =
                        '0 6px 28px rgba(59,91,219,.5), 0 1px 0 rgba(255,255,255,.12) inset'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow =
                      '0 4px 20px rgba(59,91,219,.35), 0 1px 0 rgba(255,255,255,.12) inset'
                  }}
                >
                  <span
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(255,255,255,.08) 0%, transparent 55%)',
                    }}
                  />
                  {submitting ? (
                    <>
                      <Spinner size="sm" /> Entrando…
                    </>
                  ) : (
                    'Entrar na plataforma'
                  )}
                </button>
              </form>

              <p className="mt-8 text-center text-[11px]" style={{ color: 'rgba(255,255,255,.1)' }}>
                G.A.B.I. v2 · DB1 Group · Uso interno
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
