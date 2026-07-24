import { useState, type FormEvent, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  IdCard,
  Plus,
  Pencil,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  Star,
  Trash2,
} from 'lucide-react'
import { Spinner } from '../../../components/Spinner'
import { tlEvaluationService } from '../../../services/tl-evaluation.service'
import type { Role } from '../../../types'

function ResponsibilityRow({
  roleId,
  respId,
  descricao,
  principal,
}: Readonly<{ roleId: number; respId: number; descricao: string; principal: boolean }>) {
  const qc = useQueryClient()

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-tl-roles'] })

  const toggleMutation = useMutation({
    mutationFn: () =>
      tlEvaluationService.updateResponsibility(roleId, respId, { principal: !principal }),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: () => tlEvaluationService.deleteResponsibility(roleId, respId),
    onSuccess: invalidate,
  })

  return (
    <div
      className={`flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2 ${
        principal ? 'bg-amber-950/20 border border-amber-800/30' : 'bg-slate-800'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending}
          title={principal ? 'Remover destaque de principal' : 'Marcar como principal'}
          className="shrink-0"
        >
          <Star
            size={13}
            className={
              principal
                ? 'fill-amber-400 text-amber-400'
                : 'text-slate-600 hover:text-amber-400 transition-colors'
            }
          />
        </button>
        <span className={principal ? 'text-amber-200 font-medium' : 'text-slate-300'}>
          {descricao}
        </span>
        {principal && (
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-amber-400 bg-amber-950/40 border border-amber-800/40 rounded px-1.5 py-0.5">
            Principal
          </span>
        )}
      </div>
      <button
        onClick={() => deleteMutation.mutate()}
        disabled={deleteMutation.isPending}
        title="Remover responsabilidade"
        className="shrink-0 text-slate-600 hover:text-red-400 transition-colors"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

function AddResponsibilityForm({ roleId }: Readonly<{ roleId: number }>) {
  const qc = useQueryClient()
  const [descricao, setDescricao] = useState('')
  const [principal, setPrincipal] = useState(false)

  const mutation = useMutation({
    mutationFn: () => tlEvaluationService.addResponsibility(roleId, { descricao, principal }),
    onSuccess: () => {
      setDescricao('')
      setPrincipal(false)
      qc.invalidateQueries({ queryKey: ['admin-tl-roles'] })
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!descricao.trim()) return
    mutation.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2">
      <input
        type="text"
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        placeholder="Nova responsabilidade..."
        className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-50 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"
      />
      <label className="flex items-center gap-1.5 text-[11px] text-slate-400 shrink-0 cursor-pointer">
        <input
          type="checkbox"
          checked={principal}
          onChange={(e) => setPrincipal(e.target.checked)}
          className="accent-amber-500"
        />
        <span>Principal</span>
      </label>
      <button
        type="submit"
        disabled={mutation.isPending || !descricao.trim()}
        className="shrink-0 px-2.5 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition-colors flex items-center gap-1"
      >
        {mutation.isPending ? <Spinner size="sm" /> : <Plus size={12} />}
      </button>
    </form>
  )
}

function RoleCard({ role }: Readonly<{ role: Role }>) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editNome, setEditNome] = useState(role.nome)
  const [editDescricao, setEditDescricao] = useState(role.descricao ?? '')
  const [editCategoria, setEditCategoria] = useState(role.categoria ?? '')

  const updateMutation = useMutation({
    mutationFn: () =>
      tlEvaluationService.updateRole(role.id, {
        nome: editNome,
        descricao: editDescricao,
        categoria: editCategoria,
      }),
    onSuccess: () => {
      setEditing(false)
      qc.invalidateQueries({ queryKey: ['admin-tl-roles'] })
    },
  })

  const principais = role.responsabilidades.filter((r) => r.principal)
  const secundarias = role.responsabilidades.filter((r) => !r.principal)

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
      <div className="flex items-start justify-between px-4 py-3 gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-200">{role.nome}</p>
            {role.categoria && (
              <span className="text-[9px] font-bold uppercase tracking-wide text-blue-300 bg-blue-950/40 border border-blue-800/40 rounded px-1.5 py-0.5">
                {role.categoria}
              </span>
            )}
          </div>
          {role.descricao && (
            <p className="text-xs text-slate-500 mt-1 max-w-xl">{role.descricao}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setEditing(true)}
            title="Editar papel"
            className="text-slate-500 hover:text-blue-400 transition-colors"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-200 transition-colors"
          >
            {role.responsabilidades.length} responsabilidade
            {role.responsabilidades.length === 1 ? '' : 's'}
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-700 px-4 py-3 space-y-3">
          {principais.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">
                Principais — sondadas ativamente se ausentes no relato
              </p>
              {principais.map((r) => (
                <ResponsibilityRow
                  key={r.id}
                  roleId={role.id}
                  respId={r.id}
                  descricao={r.descricao}
                  principal={r.principal}
                />
              ))}
            </div>
          )}
          {secundarias.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                Demais responsabilidades — apenas contexto
              </p>
              {secundarias.map((r) => (
                <ResponsibilityRow
                  key={r.id}
                  roleId={role.id}
                  respId={r.id}
                  descricao={r.descricao}
                  principal={r.principal}
                />
              ))}
            </div>
          )}
          {role.responsabilidades.length === 0 && (
            <p className="text-xs text-slate-600 text-center py-2">
              Nenhuma responsabilidade cadastrada ainda.
            </p>
          )}
          <AddResponsibilityForm roleId={role.id} />
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            aria-label="Cancelar"
            className="absolute inset-0 bg-black/60 cursor-default"
            onClick={() => setEditing(false)}
          />
          <div className="relative bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-200">Editar Papel</h3>
              <button
                onClick={() => setEditing(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label
                  htmlFor="edit-role-nome"
                  className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
                >
                  Nome
                </label>
                <input
                  id="edit-role-nome"
                  type="text"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  required
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-role-categoria"
                  className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
                >
                  Categoria
                </label>
                <input
                  id="edit-role-categoria"
                  type="text"
                  value={editCategoria}
                  onChange={(e) => setEditCategoria(e.target.value)}
                  placeholder="ex: Liderança Técnica"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-role-descricao"
                  className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
                >
                  Descrição
                </label>
                <textarea
                  id="edit-role-descricao"
                  value={editDescricao}
                  onChange={(e) => setEditDescricao(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 outline-none focus:border-blue-500 transition-colors resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending || !editNome}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                {updateMutation.isPending ? <Spinner size="sm" /> : <Check size={14} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function RolesSection() {
  const qc = useQueryClient()
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState('')
  const [formError, setFormError] = useState('')

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['admin-tl-roles'],
    queryFn: tlEvaluationService.listRoles,
  })

  const createMutation = useMutation({
    mutationFn: () => tlEvaluationService.createRole({ nome, descricao, categoria }),
    onSuccess: () => {
      setNome('')
      setDescricao('')
      setCategoria('')
      setFormError('')
      qc.invalidateQueries({ queryKey: ['admin-tl-roles'] })
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setFormError(detail ?? 'Erro ao criar papel.')
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    createMutation.mutate()
  }

  let rolesBody: ReactNode
  if (isLoading) {
    rolesBody = (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    )
  } else if (roles.length === 0) {
    rolesBody = <p className="text-xs text-slate-600 text-center py-6">Nenhum papel cadastrado.</p>
  } else {
    rolesBody = (
      <div className="space-y-2">
        {roles.map((role) => (
          <RoleCard key={role.id} role={role} />
        ))}
      </div>
    )
  }

  return (
    <section className="max-w-3xl">
      <div className="flex items-center gap-2 mb-4">
        <IdCard size={16} className="text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
          Papéis e Responsabilidades
        </h2>
      </div>
      <p className="text-xs text-slate-500 mb-4 max-w-xl">
        Catálogo global de papéis, usado para vincular o membro de cada squad e para orientar a
        avaliação por chat: responsabilidades marcadas como <em>principal</em> são sondadas
        ativamente pela IA quando não aparecem no relato do TL.
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-5"
      >
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">
          Novo papel
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label
              htmlFor="role-nome"
              className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
            >
              Nome
            </label>
            <input
              id="role-nome"
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="ex: Tech Lead"
              required
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div>
            <label
              htmlFor="role-categoria"
              className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
            >
              Categoria
            </label>
            <input
              id="role-categoria"
              type="text"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="ex: Liderança Técnica"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>
        <div className="mb-3">
          <label
            htmlFor="role-descricao"
            className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
          >
            Descrição
          </label>
          <textarea
            id="role-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={2}
            placeholder="Resumo do papel"
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors resize-none"
          />
        </div>
        {formError && <p className="text-xs text-red-400 mb-3">{formError}</p>}
        <button
          type="submit"
          disabled={createMutation.isPending || !nome}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors flex items-center gap-2"
        >
          {createMutation.isPending ? <Spinner size="sm" /> : <Plus size={14} />}
          Criar Papel
        </button>
      </form>

      {rolesBody}
    </section>
  )
}
