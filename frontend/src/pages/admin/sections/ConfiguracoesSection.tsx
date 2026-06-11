import { useEffect, useState, FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings2, Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { Spinner } from '../../../components/Spinner'
import { billingService } from '../../../services/billing.service'
import axios from 'axios'

function formatCnpj(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

function floatToValor(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function handleValorChange(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return (parseInt(digits, 10) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function parseValor(str: string): number {
  return parseFloat(str.replace(/\./g, '').replace(',', '.'))
}

export function ConfiguracoesSection() {
  const qc = useQueryClient()
  const [cnpj, setCnpj] = useState('')
  const [cnpjDirty, setCnpjDirty] = useState(false)
  const [newProfile, setNewProfile] = useState('')
  const [newValor, setNewValor] = useState('')
  const [editingProfile, setEditingProfile] = useState<string | null>(null)
  const [editValor, setEditValor] = useState('')
  const [rateError, setRateError] = useState('')
  const [confirmDeleteProfile, setConfirmDeleteProfile] = useState<string | null>(null)

  const { data: settings } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: billingService.getSettings,
  })

  useEffect(() => {
    if (settings && !cnpjDirty) setCnpj(formatCnpj(settings.billing_cnpj ?? ''))
  }, [settings, cnpjDirty])

  const { data: rates = [] } = useQuery({
    queryKey: ['admin-billing-rates'],
    queryFn: billingService.listRates,
  })

  const saveCnpjMutation = useMutation({
    mutationFn: () => billingService.updateSetting('billing_cnpj', cnpj.replace(/\D/g, '')),
    onSuccess: () => { setCnpjDirty(false); qc.invalidateQueries({ queryKey: ['admin-settings'] }) },
  })

  const createRateMutation = useMutation({
    mutationFn: () => billingService.createRate(newProfile.trim(), parseValor(newValor)),
    onSuccess: () => {
      setNewProfile('')
      setNewValor('')
      setRateError('')
      qc.invalidateQueries({ queryKey: ['admin-billing-rates'] })
    },
    onError: (err: unknown) => {
      if (axios.isAxiosError(err))
        setRateError(err.response?.data?.detail ?? 'Erro ao criar perfil')
    },
  })

  const updateRateMutation = useMutation({
    mutationFn: ({ profile, valor }: { profile: string; valor: number }) =>
      billingService.updateRate(profile, valor),
    onSuccess: () => { setEditingProfile(null); qc.invalidateQueries({ queryKey: ['admin-billing-rates'] }) },
  })

  const deleteRateMutation = useMutation({
    mutationFn: billingService.deleteRate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-billing-rates'] }),
  })

  const handleAddRate = (e: FormEvent) => {
    e.preventDefault()
    setRateError('')
    createRateMutation.mutate()
  }

  return (
    <section className="space-y-8">
      {/* CNPJ */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Settings2 size={16} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Empresa</h2>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 max-w-sm">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
            CNPJ
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={cnpj}
              onChange={(e) => { setCnpj(formatCnpj(e.target.value)); setCnpjDirty(true) }}
              placeholder="00.000.000/0001-00"
              className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"
            />
            <button
              onClick={() => saveCnpjMutation.mutate()}
              disabled={!cnpjDirty || saveCnpjMutation.isPending}
              className="px-3 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5"
            >
              {saveCnpjMutation.isPending ? <Spinner size="sm" /> : <Check size={13} />}
              Salvar
            </button>
          </div>
        </div>
      </div>

      {/* Billing rates */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Settings2 size={16} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Perfis e valores hora
          </h2>
        </div>

        {/* Add form — fixed position below heading */}
        <form onSubmit={handleAddRate} className="bg-slate-800 border border-slate-700 rounded-xl p-5 max-w-sm mb-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Novo perfil
          </p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input
              type="text"
              value={newProfile}
              onChange={(e) => setNewProfile(e.target.value)}
              placeholder="ex: Senior"
              required
              className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"
            />
            <input
              type="text"
              inputMode="numeric"
              value={newValor}
              onChange={(e) => setNewValor(handleValorChange(e.target.value))}
              placeholder="0,00"
              required
              className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          {rateError && <p className="text-xs text-red-400 mb-2">{rateError}</p>}
          <button
            type="submit"
            disabled={createRateMutation.isPending}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            {createRateMutation.isPending ? <Spinner size="sm" /> : <Plus size={14} />}
            Adicionar
          </button>
        </form>

        {/* Rates list — grows below the form */}
        <div className="space-y-2">
          {rates.map((r) => (
            <div
              key={r.profile}
              className="flex items-center justify-between bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-xs"
            >
              {editingProfile === r.profile ? (
                <>
                  <span className="font-semibold text-slate-300 w-24">{r.profile}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editValor}
                    onChange={(e) => setEditValor(handleValorChange(e.target.value))}
                    className="flex-1 mx-4 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-50 text-xs outline-none focus:border-blue-500"
                  />
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateRateMutation.mutate({ profile: r.profile, valor: parseValor(editValor) })}
                      disabled={updateRateMutation.isPending}
                      className="text-green-400 hover:text-green-300 transition-colors"
                    >
                      <Check size={14} />
                    </button>
                    <button onClick={() => setEditingProfile(null)} className="text-slate-600 hover:text-slate-400 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="font-semibold text-slate-300 w-24">{r.profile}</span>
                  <span className="text-slate-400">
                    R$ {floatToValor(r.valor_hora)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setEditingProfile(r.profile); setEditValor(floatToValor(r.valor_hora)) }}
                      className="text-slate-600 hover:text-slate-300 transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    {confirmDeleteProfile === r.profile ? (
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500">Excluir?</span>
                        <button
                          onClick={() => { deleteRateMutation.mutate(r.profile); setConfirmDeleteProfile(null) }}
                          disabled={deleteRateMutation.isPending}
                          className="text-red-400 hover:text-red-300 transition-colors"
                        >
                          <Check size={13} />
                        </button>
                        <button onClick={() => setConfirmDeleteProfile(null)} className="text-slate-600 hover:text-slate-400 transition-colors">
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteProfile(r.profile)}
                        className="text-slate-600 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
