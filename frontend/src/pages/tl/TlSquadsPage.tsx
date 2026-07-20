import { useState, useEffect, type FormEvent, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Layers,
  Plus,
  Pencil,
  Check,
  ChevronDown,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { Layout } from '../../components/Layout'
import { Spinner } from '../../components/Spinner'
import { tlEvaluationService } from '../../services/tl-evaluation.service'
import { competenciaLabel } from '../../lib/format'
import axios from 'axios'
import type { SquadMember, TlEvaluation } from '../../types'
import { AvaliacaoTab } from './AvaliacaoTab'

// ── Membros tab ────────────────────────────────────────────────────────────────

function MembrosTab({ squadId }: Readonly<{ squadId: number }>) {
  const qc = useQueryClient()
  const [showAddForm, setShowAddForm] = useState(false)
  const [addNome, setAddNome] = useState('')
  const [addPapel, setAddPapel] = useState('')
  const [addSenioridade, setAddSenioridade] = useState('')
  const [addFornecedor, setAddFornecedor] = useState('')
  const [addError, setAddError] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editFields, setEditFields] = useState({
    nome: '',
    papel: '',
    senioridade: '',
    fornecedor: '',
  })
  const [showInactive, setShowInactive] = useState(false)

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['tl-members', squadId, 'all'],
    queryFn: () => tlEvaluationService.listMembers(squadId, true),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      tlEvaluationService.createMember(squadId, {
        nome: addNome,
        papel: addPapel,
        senioridade: addSenioridade,
        fornecedor: addFornecedor,
      }),
    onSuccess: () => {
      setAddNome('')
      setAddPapel('')
      setAddSenioridade('')
      setAddFornecedor('')
      setAddError('')
      setShowAddForm(false)
      qc.invalidateQueries({ queryKey: ['tl-members', squadId] })
    },
    onError: (err: unknown) => {
      if (axios.isAxiosError(err)) {
        setAddError(err.response?.data?.detail ?? 'Erro ao adicionar membro.')
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      memberId,
      fields,
    }: {
      memberId: number
      fields: Parameters<typeof tlEvaluationService.updateMember>[2]
    }) => tlEvaluationService.updateMember(squadId, memberId, fields),
    onSuccess: () => {
      setEditingId(null)
      qc.invalidateQueries({ queryKey: ['tl-members', squadId] })
    },
  })

  const activeMembers = members.filter((m) => m.active)
  const inactiveMembers = members.filter((m) => !m.active)

  function handleAddSubmit(e: FormEvent) {
    e.preventDefault()
    setAddError('')
    createMutation.mutate()
  }

  function startEdit(member: SquadMember) {
    setEditingId(member.id)
    setEditFields({
      nome: member.nome,
      papel: member.papel,
      senioridade: member.senioridade,
      fornecedor: member.fornecedor,
    })
  }

  function updateEditField(field: keyof typeof editFields, value: string) {
    setEditFields((prev) => ({ ...prev, [field]: value }))
  }

  let activeMembersBody: ReactNode
  if (isLoading) {
    activeMembersBody = (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    )
  } else if (activeMembers.length === 0 && !showAddForm) {
    activeMembersBody = (
      <p className="text-xs text-slate-600 text-center py-6">
        Nenhum membro ativo. Clique em "Adicionar membro" para começar.
      </p>
    )
  } else {
    activeMembersBody = (
      <div className="space-y-1.5">
        {activeMembers.map((member) => (
          <div
            key={member.id}
            className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden"
          >
            {editingId === member.id ? (
              <div className="p-3">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {(['nome', 'papel', 'senioridade', 'fornecedor'] as const).map((field) => (
                    <div key={field}>
                      <label className="block text-xs text-slate-500 mb-1 capitalize">
                        {field}
                      </label>
                      <input
                        type="text"
                        value={editFields[field]}
                        onChange={(e) => updateEditField(field, e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-2.5 py-1.5 text-sm text-slate-50 outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() =>
                      updateMutation.mutate({ memberId: member.id, fields: editFields })
                    }
                    disabled={updateMutation.isPending}
                    className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5"
                  >
                    {updateMutation.isPending ? <Spinner size="sm" /> : <Check size={12} />}
                    Salvar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{member.nome}</p>
                  <p className="text-xs text-slate-500">
                    {member.papel} · {member.senioridade} · {member.fornecedor}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <button
                    onClick={() => startEdit(member)}
                    title="Editar"
                    className="text-slate-500 hover:text-blue-400 transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() =>
                      updateMutation.mutate({ memberId: member.id, fields: { active: false } })
                    }
                    disabled={updateMutation.isPending}
                    title="Desativar"
                    className="text-slate-500 hover:text-amber-400 transition-colors"
                  >
                    <ToggleRight size={16} className="text-green-500 hover:text-green-400" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Membros ativos
        </p>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700/20 hover:bg-blue-700/40 text-blue-300 text-xs font-semibold rounded-lg transition-colors border border-blue-700/30"
        >
          <Plus size={12} />
          Adicionar membro
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleAddSubmit}
          className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4"
        >
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Novo membro
          </p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label htmlFor="add-member-nome" className="block text-xs text-slate-500 mb-1">
                Nome
              </label>
              <input
                id="add-member-nome"
                type="text"
                value={addNome}
                onChange={(e) => setAddNome(e.target.value)}
                placeholder="Nome completo"
                required
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-2.5 py-1.5 text-sm text-slate-50 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label htmlFor="add-member-papel" className="block text-xs text-slate-500 mb-1">
                Papel
              </label>
              <input
                id="add-member-papel"
                type="text"
                value={addPapel}
                onChange={(e) => setAddPapel(e.target.value)}
                placeholder="ex: Dev, QA, PO"
                required
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-2.5 py-1.5 text-sm text-slate-50 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label htmlFor="add-member-senioridade" className="block text-xs text-slate-500 mb-1">
                Senioridade
              </label>
              <input
                id="add-member-senioridade"
                type="text"
                value={addSenioridade}
                onChange={(e) => setAddSenioridade(e.target.value)}
                placeholder="ex: Pleno, Sênior"
                required
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-2.5 py-1.5 text-sm text-slate-50 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label htmlFor="add-member-fornecedor" className="block text-xs text-slate-500 mb-1">
                Fornecedor
              </label>
              <input
                id="add-member-fornecedor"
                type="text"
                value={addFornecedor}
                onChange={(e) => setAddFornecedor(e.target.value)}
                placeholder="ex: DB1, Acme"
                required
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-2.5 py-1.5 text-sm text-slate-50 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>
          {addError && <p className="text-xs text-red-400 mb-2">{addError}</p>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5"
            >
              {createMutation.isPending ? <Spinner size="sm" /> : <Plus size={12} />}
              Adicionar
            </button>
          </div>
        </form>
      )}

      {activeMembersBody}

      {inactiveMembers.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowInactive((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-2"
          >
            {showInactive ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Inativos ({inactiveMembers.length})
          </button>
          {showInactive && (
            <div className="space-y-1.5">
              {inactiveMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between bg-slate-800/40 border border-slate-700/60 rounded-xl px-4 py-3 opacity-60"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-400 truncate">{member.nome}</p>
                    <p className="text-xs text-slate-600">
                      {member.papel} · {member.senioridade} · {member.fornecedor}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      updateMutation.mutate({ memberId: member.id, fields: { active: true } })
                    }
                    disabled={updateMutation.isPending}
                    title="Reativar"
                    className="shrink-0 ml-3"
                  >
                    <ToggleLeft
                      size={16}
                      className="text-slate-600 hover:text-green-400 transition-colors"
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Histórico tab ──────────────────────────────────────────────────────────────

function HistoricoTab({ squadId }: Readonly<{ squadId: number }>) {
  const { data: historico = [], isLoading } = useQuery({
    queryKey: ['tl-historico', squadId],
    queryFn: () => tlEvaluationService.getHistorico(squadId),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  if (historico.length === 0) {
    return (
      <p className="text-xs text-slate-600 text-center py-10">
        Nenhuma avaliação anterior registrada.
      </p>
    )
  }

  // Group by competência
  const byCompetencia = historico.reduce<Record<string, TlEvaluation[]>>((acc, ev) => {
    const key = ev.competencia
    if (!acc[key]) acc[key] = []
    acc[key].push(ev)
    return acc
  }, {})

  const sorted = Object.keys(byCompetencia).sort((a, b) => b.localeCompare(a))

  return (
    <div className="max-w-2xl space-y-6">
      {sorted.map((comp) => (
        <div key={comp}>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            {competenciaLabel(comp)}
          </p>
          <div className="space-y-2">
            {byCompetencia[comp].map((ev) => (
              <div key={ev.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <p className="text-sm font-semibold text-slate-200 mb-3">
                  {ev.nome ?? `Membro #${ev.squadMemberId}`}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      label: 'Comportamental',
                      nota: ev.comportamentalNota,
                      paragrafo: ev.comportamentalParagrafo,
                    },
                    { label: 'Técnica', nota: ev.tecnicaNota, paragrafo: ev.tecnicaParagrafo },
                    {
                      label: 'Prazos de Entrega',
                      nota: ev.prazoNota,
                      paragrafo: ev.prazoParagrafo,
                    },
                  ].map(({ label, nota, paragrafo }) => (
                    <div key={label} className="bg-slate-900 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-slate-400">{label}</p>
                        <span className="w-7 h-7 rounded-full bg-blue-800/40 border border-blue-700/40 flex items-center justify-center text-xs font-bold text-blue-300">
                          {nota}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{paragrafo}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

type Tab = 'membros' | 'historico' | 'avaliacao'

const TAB_LABELS: Record<Tab, string> = {
  membros: 'Membros',
  historico: 'Histórico',
  avaliacao: 'Avaliação',
}

export function TlSquadsPage() {
  const [selectedSquadId, setSelectedSquadId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('membros')

  const { data: squads = [], isLoading } = useQuery({
    queryKey: ['tl-my-squads'],
    queryFn: tlEvaluationService.listMySquads,
  })

  useEffect(() => {
    if (squads.length > 0 && selectedSquadId === null) {
      setSelectedSquadId(squads[0].id)
    }
  }, [squads, selectedSquadId])

  const selectedSquad = squads.find((s) => s.id === selectedSquadId) ?? null

  let squadsBody: ReactNode
  if (isLoading) {
    squadsBody = (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  } else if (squads.length === 0) {
    squadsBody = (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Layers size={32} className="text-slate-600 mb-3" />
        <p className="text-sm text-slate-500">Nenhum squad atribuído a você.</p>
        <p className="text-xs text-slate-600 mt-1">
          Um administrador precisa criar um squad com seu e-mail como Tech Lead.
        </p>
      </div>
    )
  } else {
    squadsBody = (
      <>
        {/* Squad selector */}
        {squads.length > 1 && (
          <div className="flex gap-2 flex-wrap mb-5">
            {squads.map((squad) => (
              <button
                key={squad.id}
                onClick={() => setSelectedSquadId(squad.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  selectedSquadId === squad.id
                    ? 'bg-blue-700/20 text-blue-300 border-blue-700/40'
                    : 'text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {squad.nome}
              </button>
            ))}
          </div>
        )}

        {selectedSquad && (
          <>
            {squads.length === 1 && (
              <p className="text-sm font-semibold text-slate-200 mb-4">{selectedSquad.nome}</p>
            )}

            {/* Tabs */}
            <div className="flex gap-0 border-b border-slate-700 mb-5">
              {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activeTab === tab
                      ? 'text-blue-300 border-blue-500'
                      : 'text-slate-400 border-transparent hover:text-slate-200'
                  }`}
                >
                  {TAB_LABELS[tab]}
                </button>
              ))}
            </div>

            {activeTab === 'membros' && <MembrosTab squadId={selectedSquad.id} />}
            {activeTab === 'historico' && <HistoricoTab squadId={selectedSquad.id} />}
            {activeTab === 'avaliacao' && (
              <AvaliacaoTab squadId={selectedSquad.id} squadName={selectedSquad.nome} />
            )}
          </>
        )}
      </>
    )
  }

  return (
    <Layout>
      <div className="px-6 py-7">
        <div className="flex items-center gap-2 mb-6">
          <Layers size={16} className="text-slate-400" />
          <h1 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Meus Squads
          </h1>
        </div>

        {squadsBody}
      </div>
    </Layout>
  )
}
