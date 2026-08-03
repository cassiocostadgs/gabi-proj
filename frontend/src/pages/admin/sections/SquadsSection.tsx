import { useState, type FormEvent, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Layers, Plus, Pencil, ChevronDown, ChevronRight, X, Check, Users } from 'lucide-react'
import { Spinner } from '../../../components/Spinner'
import { SelectField } from '../../../components/ui/select'
import { tlEvaluationService } from '../../../services/tl-evaluation.service'
import { adminService } from '../../../services/admin.service'
import axios from 'axios'
import type { Squad } from '../../../types'

export function SquadsSection() {
  const qc = useQueryClient()
  const [nome, setNome] = useState('')
  const [techLeadEmail, setTechLeadEmail] = useState('')
  const [formError, setFormError] = useState('')
  const [editingSquad, setEditingSquad] = useState<Squad | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editTechLeadEmail, setEditTechLeadEmail] = useState('')
  const [editError, setEditError] = useState('')
  const [expandedSquadId, setExpandedSquadId] = useState<number | null>(null)

  const { data: squads = [], isLoading } = useQuery({
    queryKey: ['admin-squads'],
    queryFn: tlEvaluationService.listSquads,
  })

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: adminService.listUsers,
  })

  const { data: expandedMembers = [], isLoading: loadingMembers } = useQuery({
    queryKey: ['admin-squad-members', expandedSquadId],
    queryFn: () => tlEvaluationService.listSquadMembersAdmin(expandedSquadId!),
    enabled: expandedSquadId !== null,
  })

  const createMutation = useMutation({
    mutationFn: () => tlEvaluationService.createSquad(nome, techLeadEmail),
    onSuccess: () => {
      setNome('')
      setTechLeadEmail('')
      setFormError('')
      qc.invalidateQueries({ queryKey: ['admin-squads'] })
    },
    onError: (err: unknown) => {
      if (axios.isAxiosError(err)) {
        setFormError(err.response?.data?.detail ?? 'Erro ao criar squad.')
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      tlEvaluationService.updateSquad(editingSquad!.id, {
        nome: editNome,
        techLeadUserEmail: editTechLeadEmail,
      }),
    onSuccess: () => {
      setEditingSquad(null)
      qc.invalidateQueries({ queryKey: ['admin-squads'] })
    },
    onError: (err: unknown) => {
      if (axios.isAxiosError(err)) {
        setEditError(err.response?.data?.detail ?? 'Erro ao salvar squad.')
      }
    },
  })

  const userOptions = users
    .filter((u) => u.is_active)
    .map((u) => ({ value: u.email, label: u.email }))

  function handleCreateSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    createMutation.mutate()
  }

  function openEdit(squad: Squad) {
    setEditingSquad(squad)
    setEditNome(squad.nome)
    setEditTechLeadEmail(squad.techLeadUserEmail)
    setEditError('')
  }

  function toggleExpand(squadId: number) {
    setExpandedSquadId((prev) => (prev === squadId ? null : squadId))
  }

  function renderMembersBody(): ReactNode {
    if (loadingMembers) {
      return (
        <div className="flex justify-center py-3">
          <Spinner size="sm" />
        </div>
      )
    }
    if (expandedMembers.length === 0) {
      return <p className="text-xs text-slate-600 text-center py-2">Nenhum membro registrado.</p>
    }
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Membros</p>
        {expandedMembers.map((member) => (
          <div
            key={member.id}
            className={`flex items-center justify-between text-xs rounded-lg px-3 py-2 ${
              member.active ? 'bg-slate-800' : 'bg-slate-800/40 opacity-60'
            }`}
          >
            <div className="min-w-0">
              <span className="font-medium text-slate-300">{member.nome}</span>
              <span className="text-slate-500 ml-2">
                {member.papel} · {member.senioridade} · {member.fornecedor}
              </span>
            </div>
            {!member.active && <span className="text-slate-600 ml-2 shrink-0">inativo</span>}
          </div>
        ))}
      </div>
    )
  }

  function renderSquadsBody(): ReactNode {
    if (isLoading) {
      return (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )
    }
    if (squads.length === 0) {
      return <p className="text-xs text-slate-600 text-center py-6">Nenhum squad cadastrado.</p>
    }
    return (
      <div className="space-y-2">
        {squads.map((squad) => (
          <div
            key={squad.id}
            className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-200 truncate">{squad.nome}</p>
                <p className="text-xs text-slate-500 truncate">{squad.techLeadUserEmail}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-3">
                <button
                  onClick={() => openEdit(squad)}
                  title="Editar squad"
                  className="text-slate-500 hover:text-blue-400 transition-colors"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => toggleExpand(squad.id)}
                  title={expandedSquadId === squad.id ? 'Recolher membros' : 'Ver membros'}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-200 transition-colors"
                >
                  <Users size={13} />
                  {expandedSquadId === squad.id ? (
                    <ChevronDown size={13} />
                  ) : (
                    <ChevronRight size={13} />
                  )}
                </button>
              </div>
            </div>

            {expandedSquadId === squad.id && (
              <div className="border-t border-slate-700 px-4 py-3">{renderMembersBody()}</div>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <section className="max-w-3xl">
      <div className="flex items-center gap-2 mb-4">
        <Layers size={16} className="text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Squads</h2>
      </div>

      <form
        onSubmit={handleCreateSubmit}
        className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-5"
      >
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">
          Novo squad
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label
              htmlFor="squad-nome"
              className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
            >
              Nome
            </label>
            <input
              id="squad-nome"
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do squad"
              required
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div>
            <label
              htmlFor="squad-tl"
              className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
            >
              Tech Lead
            </label>
            <SelectField
              id="squad-tl"
              value={techLeadEmail}
              onValueChange={setTechLeadEmail}
              options={userOptions}
              placeholder="Selecione o TL..."
              required
            />
          </div>
        </div>
        {formError && <p className="text-xs text-red-400 mb-3">{formError}</p>}
        <button
          type="submit"
          disabled={createMutation.isPending || !techLeadEmail}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors flex items-center gap-2"
        >
          {createMutation.isPending ? <Spinner size="sm" /> : <Plus size={14} />}
          Criar Squad
        </button>
      </form>

      {renderSquadsBody()}

      {editingSquad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            aria-label="Cancelar"
            className="absolute inset-0 bg-black/60 cursor-default"
            onClick={() => setEditingSquad(null)}
          />
          <div className="relative bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-200">Editar Squad</h3>
              <button
                onClick={() => setEditingSquad(null)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label
                  htmlFor="edit-squad-nome"
                  className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
                >
                  Nome
                </label>
                <input
                  id="edit-squad-nome"
                  type="text"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  required
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-squad-tl"
                  className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
                >
                  Tech Lead
                </label>
                <SelectField
                  id="edit-squad-tl"
                  value={editTechLeadEmail}
                  onValueChange={setEditTechLeadEmail}
                  options={userOptions}
                  placeholder="Selecione o TL..."
                />
              </div>
            </div>
            {editError && <p className="text-xs text-red-400 mb-3">{editError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditingSquad(null)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending || !editNome || !editTechLeadEmail}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                {updateMutation.isPending ? <Spinner size="sm" /> : <Check size={14} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
