import { useState, FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Trash2, Pencil, Check, X, UserX, UserCheck } from 'lucide-react'
import { MonthPicker } from '../../../components/MonthPicker'
import { Spinner } from '../../../components/Spinner'
import { SelectField } from '../../../components/ui/select'
import { adminService } from '../../../services/admin.service'
import { billingService } from '../../../services/billing.service'
import { competenciaLabel } from '../../../lib/format'
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
  const [nomeCompleto, setNomeCompleto] = useState('')
  const [formError, setFormError] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editFields, setEditFields] = useState({
    cpf: '',
    subcontrato: '',
    profile: '',
    nome_completo: '',
    is_active: true,
  })
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deactivatingId, setDeactivatingId] = useState<number | null>(null)
  const [deactivateComp, setDeactivateComp] = useState('')
  const [deactivatePickerYear, setDeactivatePickerYear] = useState(new Date().getFullYear())
  const [showDeactivatePicker, setShowDeactivatePicker] = useState(false)

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
    mutationFn: () =>
      billingService.createMember({
        user_email: email,
        cpf,
        subcontrato,
        profile,
        nome_completo: nomeCompleto,
      }),
    onSuccess: () => {
      setEmail('')
      setCpf('')
      setSubcontrato('')
      setProfile('')
      setNomeCompleto('')
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

  const deactivateMutation = useMutation({
    mutationFn: ({ id, competencia }: { id: number; competencia: string }) =>
      billingService.deactivateMember(id, competencia),
    onSuccess: () => {
      setDeactivatingId(null)
      setDeactivateComp('')
      setShowDeactivatePicker(false)
      qc.invalidateQueries({ queryKey: ['admin-team'] })
      qc.invalidateQueries({ queryKey: ['admin-submissions-summary'] })
    },
  })

  const activateMutation = useMutation({
    mutationFn: (id: number) => billingService.activateMember(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-team'] })
      qc.invalidateQueries({ queryKey: ['admin-submissions-summary'] })
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    createMutation.mutate()
  }

  return (
    <section className="max-w-2xl">
      {deactivatingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            className="absolute inset-0 bg-black/60 cursor-default border-0"
            onClick={() => {
              setDeactivatingId(null)
              setDeactivateComp('')
              setShowDeactivatePicker(false)
            }}
            aria-label="Fechar modal"
          />
          <div className="relative bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-200 mb-1">Inativar membro</h3>
            <p className="text-xs text-slate-500 mb-4">
              A partir de qual competência este membro não deve ser esperado?
            </p>
            <p className="text-xs font-medium text-slate-400 mb-1.5">Competência</p>
            <button
              onClick={() => setShowDeactivatePicker((v) => !v)}
              className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-100 border transition-colors mb-2 ${
                showDeactivatePicker
                  ? 'bg-slate-900 border-indigo-500'
                  : 'bg-slate-900 border-slate-600 hover:border-indigo-500'
              }`}
            >
              <span>{deactivateComp ? competenciaLabel(deactivateComp) : 'Selecione...'}</span>
              <Pencil size={12} className="text-slate-500 shrink-0 ml-2" />
            </button>
            {showDeactivatePicker && (
              <div className="mb-4">
                <MonthPicker
                  pickerYear={deactivatePickerYear}
                  selectedCompetencia={deactivateComp}
                  onYearChange={(delta) => setDeactivatePickerYear((y) => y + delta)}
                  onMonthSelect={(comp) => {
                    setDeactivateComp(comp)
                    setShowDeactivatePicker(false)
                  }}
                />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setDeactivatingId(null)
                  setDeactivateComp('')
                  setShowDeactivatePicker(false)
                }}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() =>
                  deactivateMutation.mutate({ id: deactivatingId, competencia: deactivateComp })
                }
                disabled={!deactivateComp || deactivateMutation.isPending}
                className="px-4 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                {deactivateMutation.isPending ? <Spinner size="sm" /> : <UserX size={14} />}
                Inativar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sticky top-[57px] sm:top-0 z-10 bg-slate-900 pb-4">
        <div className="flex items-center gap-2 mb-4">
          <Users size={16} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Equipe de faturamento
          </h2>
        </div>

        {/* Add member form */}
        <form
          onSubmit={handleSubmit}
          className="bg-slate-800 border border-slate-700 rounded-xl p-5"
        >
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">
            Novo membro
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label
                htmlFor="equipe-nome"
                className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
              >
                Nome completo
              </label>
              <input
                id="equipe-nome"
                type="text"
                value={nomeCompleto}
                onChange={(e) => setNomeCompleto(e.target.value)}
                placeholder="Nome Sobrenome"
                required
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 placeholder-slate-600 outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label
                htmlFor="equipe-usuario"
                className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
              >
                Usuário
              </label>
              <SelectField
                id="equipe-usuario"
                value={email}
                onValueChange={setEmail}
                options={availableUsers.map((u) => ({ value: u.email, label: u.email }))}
                required
              />
            </div>
            <div>
              <label
                htmlFor="equipe-perfil"
                className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
              >
                Perfil
              </label>
              <SelectField
                id="equipe-perfil"
                value={profile}
                onValueChange={setProfile}
                options={rates.map((r) => ({
                  value: r.profile,
                  label: `${r.profile} — R$ ${r.valor_hora.toFixed(2)}`,
                }))}
                required
              />
            </div>
            <div>
              <label
                htmlFor="equipe-cpf"
                className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
              >
                CPF
              </label>
              <input
                id="equipe-cpf"
                type="text"
                value={cpf}
                onChange={(e) => setCpf(formatCpf(e.target.value))}
                placeholder="000.000.000-00"
                required
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 placeholder-slate-600 outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label
                htmlFor="equipe-subcontrato"
                className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
              >
                Subcontrato
              </label>
              <input
                id="equipe-subcontrato"
                type="text"
                value={subcontrato}
                onChange={(e) => setSubcontrato(e.target.value)}
                placeholder="SUB 01"
                required
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 placeholder-slate-600 outline-none focus:border-indigo-500 transition-colors"
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
      </div>

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
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <input
                    type="text"
                    value={editFields.nome_completo}
                    onChange={(e) =>
                      setEditFields((f) => ({ ...f, nome_completo: e.target.value }))
                    }
                    placeholder="Nome completo"
                    className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-50 text-xs outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    value={editFields.cpf}
                    onChange={(e) =>
                      setEditFields((f) => ({ ...f, cpf: formatCpf(e.target.value) }))
                    }
                    placeholder="CPF"
                    className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-50 text-xs outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    value={editFields.subcontrato}
                    onChange={(e) => setEditFields((f) => ({ ...f, subcontrato: e.target.value }))}
                    placeholder="Subcontrato"
                    className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-50 text-xs outline-none focus:border-indigo-500"
                  />
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <SelectField
                        value={editFields.profile}
                        onValueChange={(val) => setEditFields((f) => ({ ...f, profile: val }))}
                        options={rates.map((r) => ({ value: r.profile, label: r.profile }))}
                        variant="compact"
                      />
                    </div>
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
                    {m.nome_completo ? (
                      <span className="font-semibold text-slate-300">{m.nome_completo}</span>
                    ) : (
                      <span className="font-semibold text-amber-400 italic">
                        Nome pendente de cadastro
                      </span>
                    )}
                    <span className="text-slate-500 ml-3">{m.user_email}</span>
                    <span className="text-slate-500 ml-3">{m.cpf}</span>
                    <span className="text-slate-500 ml-3">{m.subcontrato}</span>
                    <span className="ml-2 bg-slate-800 text-slate-400 border border-slate-700 text-[0.6rem] font-bold px-1.5 py-0.5 rounded uppercase">
                      {m.profile}
                    </span>
                    {!m.is_active && m.deactivated_from_competencia && (
                      <span className="ml-2 bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[0.6rem] font-bold px-1.5 py-0.5 rounded uppercase">
                        inativo a partir de {competenciaLabel(m.deactivated_from_competencia)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {m.is_active ? (
                      <>
                        <button
                          onClick={() => {
                            setEditingId(m.id)
                            setEditFields({
                              cpf: m.cpf,
                              subcontrato: m.subcontrato,
                              profile: m.profile,
                              nome_completo: m.nome_completo,
                              is_active: m.is_active,
                            })
                          }}
                          className="text-slate-600 hover:text-slate-300 transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => {
                            setDeactivatingId(m.id)
                            setDeactivateComp('')
                            setDeactivatePickerYear(new Date().getFullYear())
                            setShowDeactivatePicker(false)
                          }}
                          title="Inativar membro"
                          className="text-slate-600 hover:text-amber-400 transition-colors"
                        >
                          <UserX size={13} />
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
                      </>
                    ) : (
                      <button
                        onClick={() => activateMutation.mutate(m.id)}
                        disabled={activateMutation.isPending}
                        title="Reativar membro"
                        className="text-slate-600 hover:text-emerald-400 transition-colors"
                      >
                        <UserCheck size={13} />
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
