import { useState, FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { Spinner } from '../../../components/Spinner'
import { adminService } from '../../../services/admin.service'
import { billingService } from '../../../services/billing.service'
import axios from 'axios'

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

export function EquipeSection() {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [subcontrato, setSubcontrato] = useState('')
  const [profile, setProfile] = useState('')
  const [formError, setFormError] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editFields, setEditFields] = useState({
    cpf: '',
    subcontrato: '',
    profile: '',
    is_active: true,
  })
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['admin-team'],
    queryFn: billingService.listTeam,
  })

  const { data: rates = [] } = useQuery({
    queryKey: ['admin-billing-rates'],
    queryFn: billingService.listRates,
  })

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: adminService.listUsers,
  })

  const existingEmails = new Set(members.map((m) => m.user_email))
  const availableUsers = users.filter((u) => !existingEmails.has(u.email))

  const createMutation = useMutation({
    mutationFn: () => billingService.createMember({ user_email: email, cpf, subcontrato, profile }),
    onSuccess: () => {
      setEmail('')
      setCpf('')
      setSubcontrato('')
      setProfile('')
      setFormError('')
      qc.invalidateQueries({ queryKey: ['admin-team'] })
    },
    onError: (err: unknown) => {
      if (axios.isAxiosError(err)) setFormError(err.response?.data?.detail ?? 'Erro ao adicionar')
    },
  })

  const updateMutation = useMutation({
    mutationFn: () => billingService.updateMember(editingId!, editFields),
    onSuccess: () => {
      setEditingId(null)
      qc.invalidateQueries({ queryKey: ['admin-team'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => billingService.deleteMember(id),
    onSuccess: () => {
      setConfirmDeleteId(null)
      qc.invalidateQueries({ queryKey: ['admin-team'] })
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    createMutation.mutate()
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Users size={16} className="text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
          Equipe de faturamento
        </h2>
      </div>

      {/* Add member form */}
      <form
        onSubmit={handleSubmit}
        className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-5"
      >
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">
          Novo membro
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              Usuário
            </label>
            <select
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 outline-none focus:border-blue-500 transition-colors"
            >
              <option value="">Selecione...</option>
              {availableUsers.map((u) => (
                <option key={u.email} value={u.email}>
                  {u.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              Perfil
            </label>
            <select
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              required
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 outline-none focus:border-blue-500 transition-colors"
            >
              <option value="">Selecione...</option>
              {rates.map((r) => (
                <option key={r.profile} value={r.profile}>
                  {r.profile} — R$ {r.valor_hora.toFixed(2)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              CPF
            </label>
            <input
              type="text"
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              placeholder="000.000.000-00"
              required
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              Subcontrato
            </label>
            <input
              type="text"
              value={subcontrato}
              onChange={(e) => setSubcontrato(e.target.value)}
              placeholder="SUB 01"
              required
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>
        {formError && <p className="text-xs text-red-400 mb-3">{formError}</p>}
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors flex items-center gap-2"
        >
          {createMutation.isPending ? <Spinner size="sm" /> : <Plus size={14} />}
          Adicionar
        </button>
      </form>

      {/* Members list */}
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className={`border rounded-lg px-4 py-3 text-xs ${m.is_active ? 'bg-slate-900 border-slate-700' : 'bg-slate-950 border-slate-800 opacity-50'}`}
            >
              {editingId === m.id ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={editFields.cpf}
                    onChange={(e) =>
                      setEditFields((f) => ({ ...f, cpf: formatCpf(e.target.value) }))
                    }
                    placeholder="CPF"
                    className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-50 text-xs outline-none focus:border-blue-500"
                  />
                  <input
                    type="text"
                    value={editFields.subcontrato}
                    onChange={(e) => setEditFields((f) => ({ ...f, subcontrato: e.target.value }))}
                    placeholder="Subcontrato"
                    className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-50 text-xs outline-none focus:border-blue-500"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={editFields.profile}
                      onChange={(e) => setEditFields((f) => ({ ...f, profile: e.target.value }))}
                      className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-50 text-xs outline-none focus:border-blue-500"
                    >
                      {rates.map((r) => (
                        <option key={r.profile} value={r.profile}>
                          {r.profile}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => updateMutation.mutate()}
                      disabled={updateMutation.isPending}
                      className="text-green-400 hover:text-green-300 transition-colors"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-slate-600 hover:text-slate-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-300">{m.user_email}</span>
                    <span className="text-slate-500 ml-3">{m.cpf}</span>
                    <span className="text-slate-500 ml-3">{m.subcontrato}</span>
                    <span className="ml-2 bg-slate-800 text-slate-400 border border-slate-700 text-[0.6rem] font-bold px-1.5 py-0.5 rounded uppercase">
                      {m.profile}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <button
                      onClick={() => {
                        setEditingId(m.id)
                        setEditFields({
                          cpf: m.cpf,
                          subcontrato: m.subcontrato,
                          profile: m.profile,
                          is_active: m.is_active,
                        })
                      }}
                      className="text-slate-600 hover:text-slate-300 transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    {confirmDeleteId === m.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500">Excluir?</span>
                        <button
                          onClick={() => deleteMutation.mutate(m.id)}
                          disabled={deleteMutation.isPending}
                          className="text-red-400 hover:text-red-300 transition-colors"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-slate-600 hover:text-slate-400 transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(m.id)}
                        className="text-slate-600 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {members.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-6">Nenhum membro cadastrado.</p>
          )}
        </div>
      )}
    </section>
  )
}
