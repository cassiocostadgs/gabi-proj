import { useState, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageSquareText, Lock, Pencil, Check, X, History, Plus, Play } from 'lucide-react'
import { Spinner } from '../../../components/Spinner'
import { tlEvaluationService } from '../../../services/tl-evaluation.service'
import type { PromptSectionKey } from '../../../types'

const PROMPT_QUERY_KEY = ['admin-tl-prompt']

const SECTION_LABELS: Record<PromptSectionKey, string> = {
  papel: 'Papel do assistente',
  fluxo: 'Fluxo de trabalho',
  gateA: 'Gate A — Nota 5 exige fato externo de superação',
  gateB: 'Gate B — Afirmação genérica exige exemplo concreto',
  regras: 'Regras de geração (inegociáveis)',
  instrucao: 'Instrução de resposta',
  adicionais: 'Instruções adicionais',
}

const VERSIONED_SECTIONS: Set<PromptSectionKey> = new Set(['gateA', 'gateB', 'regras'])

function Badge({
  children,
  tone,
}: Readonly<{ children: ReactNode; tone: 'locked' | 'editable' | 'structured' }>) {
  const classes = {
    locked: 'bg-slate-800/60 text-slate-400 border-slate-600',
    editable: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    structured: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  }[tone]
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${classes}`}
    >
      {children}
    </span>
  )
}

function HistoryPanel({ sectionKey }: Readonly<{ sectionKey: PromptSectionKey | 'voz' }>) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['admin-tl-prompt-history', sectionKey],
    queryFn: () => tlEvaluationService.getPromptSectionHistory(sectionKey),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-3">
        <Spinner size="sm" />
      </div>
    )
  }
  if (history.length === 0) {
    return (
      <p className="text-xs text-slate-600 border-t border-dashed border-slate-700 pt-3 mt-3">
        Nenhuma versão anterior registrada ainda.
      </p>
    )
  }
  return (
    <div className="border-t border-dashed border-slate-700 pt-3 mt-3 space-y-2">
      {[...history].reverse().map((entry, i) => (
        <div
          key={`${entry.changedAt}-${i}`}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
        >
          <p className="text-[11px] text-slate-500 mb-1">
            <strong className="text-slate-400 font-semibold">{entry.changedBy}</strong> ·{' '}
            {entry.changedAt}
          </p>
          <p className="text-xs text-slate-300 font-mono whitespace-pre-wrap line-clamp-3">
            {entry.content}
          </p>
        </div>
      ))}
    </div>
  )
}

function EditableSectionCard({
  sectionKey,
  content,
  updatedBy,
  updatedAt,
  versioned,
}: Readonly<{
  sectionKey: PromptSectionKey
  content: string
  updatedBy: string
  updatedAt: string
  versioned: boolean
}>) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content)
  const [historyOpen, setHistoryOpen] = useState(false)

  const mutation = useMutation({
    mutationFn: (text: string) => tlEvaluationService.updatePromptSection(sectionKey, text),
    onSuccess: () => {
      setEditing(false)
      qc.invalidateQueries({ queryKey: PROMPT_QUERY_KEY })
      if (versioned) qc.invalidateQueries({ queryKey: ['admin-tl-prompt-history', sectionKey] })
    },
  })

  function startEditing() {
    setDraft(content)
    setEditing(true)
  }

  return (
    <div className="core-section border-t border-slate-700 first:border-t-0 px-5 py-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wide">
          {SECTION_LABELS[sectionKey]}
        </h3>
        <Badge tone="editable">{versioned ? 'Editável · versionado' : 'Editável'}</Badge>
      </div>

      {editing ? (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={sectionKey === 'regras' ? 7 : 4}
            className="w-full bg-slate-800 border border-blue-700 rounded-lg px-3 py-2.5 text-sm text-slate-50 leading-relaxed outline-none focus:border-blue-500 transition-colors"
          />
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={() => mutation.mutate(draft)}
              disabled={mutation.isPending}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5"
            >
              {mutation.isPending ? <Spinner size="sm" /> : <Check size={12} />}
              Salvar
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs transition-colors flex items-center gap-1.5"
            >
              <X size={12} />
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{content}</p>
      )}

      <div className="flex items-center gap-4 mt-3">
        {!editing && (
          <button
            onClick={startEditing}
            className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
          >
            <Pencil size={11} />
            Editar
          </button>
        )}
        {versioned && (
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
          >
            <History size={11} />
            Ver histórico
          </button>
        )}
        <span className="text-[11px] text-slate-500 ml-auto">
          Última alteração por <strong className="text-slate-400 font-semibold">{updatedBy}</strong>{' '}
          em <strong className="text-slate-400 font-semibold">{updatedAt}</strong>
        </span>
      </div>

      {versioned && historyOpen && <HistoryPanel sectionKey={sectionKey} />}
    </div>
  )
}

function EscalaCard({ text }: Readonly<{ text: string }>) {
  return (
    <div className="core-section border-t border-slate-700 px-5 py-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wide">
          Escala de referência
        </h3>
        <Badge tone="locked">Somente leitura</Badge>
      </div>
      <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  )
}

function VoiceRuleCard({ words }: Readonly<{ words: string[] }>) {
  const qc = useQueryClient()
  const [newWord, setNewWord] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [error, setError] = useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: PROMPT_QUERY_KEY })

  const addMutation = useMutation({
    mutationFn: (palavra: string) => tlEvaluationService.addForbiddenWord(palavra),
    onSuccess: () => {
      setNewWord('')
      setError('')
      invalidate()
      qc.invalidateQueries({ queryKey: ['admin-tl-prompt-history', 'voz'] })
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Erro ao adicionar palavra.')
    },
  })

  const removeMutation = useMutation({
    mutationFn: (palavra: string) => tlEvaluationService.removeForbiddenWord(palavra),
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['admin-tl-prompt-history', 'voz'] })
    },
  })

  return (
    <div className="core-section border-t border-slate-700 px-5 py-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wide">
          Regra de voz (inegociável)
        </h3>
        <Badge tone="structured">Lista estruturada · editável</Badge>
      </div>
      <p className="text-sm text-slate-300 leading-relaxed mb-3">
        O parágrafo é a voz do TL registrando a observação — o profissional avaliado é sempre o
        sujeito gramatical. As expressões abaixo são proibidas em qualquer campo de parágrafo
        (quando usadas para narrar o TL):
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {words.map((w) => (
          <span
            key={w}
            className="inline-flex items-center gap-1.5 bg-slate-900 border border-slate-600 rounded-full pl-3 pr-1.5 py-1 text-xs font-mono text-slate-200"
          >
            {w}
            <button
              onClick={() => removeMutation.mutate(w)}
              disabled={removeMutation.isPending}
              title={`Remover "${w}"`}
              className="text-slate-500 hover:text-red-400 transition-colors leading-none px-1"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2 mb-1">
        <input
          type="text"
          value={newWord}
          onChange={(e) => setNewWord(e.target.value)}
          placeholder="nova palavra ou expressão proibida…"
          className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-50 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"
        />
        <button
          onClick={() => newWord.trim() && addMutation.mutate(newWord.trim())}
          disabled={addMutation.isPending || !newWord.trim()}
          className="px-3 py-1.5 text-slate-300 hover:text-blue-300 border border-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 disabled:opacity-50"
        >
          {addMutation.isPending ? <Spinner size="sm" /> : <Plus size={12} />}
          Adicionar
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      <div className="bg-blue-950/20 border border-blue-800/30 text-blue-300 rounded-lg px-3 py-2.5 text-xs leading-relaxed mt-3">
        Esta lista é a única fonte de verdade: alimenta tanto o texto do prompt quanto o validador
        pós-resposta (<code>_check_voice_rule</code>). Adicionar ou remover uma palavra aqui
        atualiza os dois lados — sem risco de divergência.
      </div>

      <button
        onClick={() => setHistoryOpen((v) => !v)}
        className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 mt-3"
      >
        <History size={11} />
        Ver histórico
      </button>
      {historyOpen && <HistoryPanel sectionKey="voz" />}
    </div>
  )
}

function defaultCompetencia(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function SimuladorTab() {
  const [squadId, setSquadId] = useState<number | ''>('')
  const [memberId, setMemberId] = useState<number | ''>('')
  const [competencia, setCompetencia] = useState(defaultCompetencia())
  const [result, setResult] = useState<string | null>(null)
  const [caption, setCaption] = useState('')

  const { data: squads = [] } = useQuery({
    queryKey: ['admin-tl-prompt-squads'],
    queryFn: tlEvaluationService.listSquads,
  })

  const { data: members = [] } = useQuery({
    queryKey: ['admin-tl-prompt-members', squadId],
    queryFn: () => tlEvaluationService.listSquadMembersAdmin(squadId as number),
    enabled: squadId !== '',
  })

  const previewMutation = useMutation({
    mutationFn: () =>
      tlEvaluationService.previewPrompt(squadId as number, memberId as number, competencia),
    onSuccess: (system) => {
      const squad = squads.find((s) => s.id === squadId)
      const member = members.find((m) => m.id === memberId)
      setResult(system)
      setCaption(`${squad?.nome ?? ''} · ${member?.nome ?? ''} · ${competencia}`)
    },
  })

  return (
    <div>
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label
              htmlFor="sim-squad"
              className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
            >
              Squad
            </label>
            <select
              id="sim-squad"
              value={squadId}
              onChange={(e) => {
                setSquadId(e.target.value ? Number(e.target.value) : '')
                setMemberId('')
                setResult(null)
              }}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 outline-none focus:border-blue-500 transition-colors"
            >
              <option value="">Selecione…</option>
              {squads.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="sim-membro"
              className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
            >
              Profissional
            </label>
            <select
              id="sim-membro"
              value={memberId}
              onChange={(e) => {
                setMemberId(e.target.value ? Number(e.target.value) : '')
                setResult(null)
              }}
              disabled={squadId === ''}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
            >
              <option value="">Selecione…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome} — {m.papel} ({m.senioridade})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="sim-competencia"
              className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
            >
              Competência
            </label>
            <input
              id="sim-competencia"
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>
        <button
          onClick={() => previewMutation.mutate()}
          disabled={previewMutation.isPending || squadId === '' || memberId === ''}
          className="mt-4 px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors flex items-center gap-2"
        >
          {previewMutation.isPending ? <Spinner size="sm" /> : <Play size={14} />}
          Simular
        </button>
      </div>

      {result === null ? (
        <p className="text-xs text-slate-600 text-center border border-dashed border-slate-700 rounded-xl py-8 mt-4">
          Selecione squad, profissional e competência, depois clique em Simular para ver o prompt
          completo e real que seria enviado à API do Claude nesta avaliação.
        </p>
      ) : (
        <div className="mt-4">
          <p className="text-xs font-mono text-slate-500 mb-2">{caption}</p>
          <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap max-h-[28rem] overflow-y-auto overflow-x-auto">
            {result}
          </pre>
        </div>
      )}
    </div>
  )
}

export function TlEvaluationPromptSection() {
  const [tab, setTab] = useState<'nucleo' | 'adicionais' | 'simulador'>('nucleo')

  const { data: settings, isLoading } = useQuery({
    queryKey: PROMPT_QUERY_KEY,
    queryFn: tlEvaluationService.getPromptSettings,
  })

  return (
    <section className="max-w-4xl">
      <div className="flex items-center gap-2 mb-1">
        <MessageSquareText size={16} className="text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
          Prompt de Avaliação TL
        </h2>
      </div>
      <p className="text-xs text-slate-500 mb-4 max-w-2xl">
        Visibilidade do que é enviado à API do Claude e ajuste pontual, sem deploy. Acesso exclusivo
        do admin — o TL nunca vê esta tela.
      </p>

      <div className="flex gap-0 border-b border-slate-700 mb-5">
        {(
          [
            ['nucleo', 'Núcleo estrutural'],
            ['adicionais', 'Instruções adicionais'],
            ['simulador', 'Simulador'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === key
                ? 'text-blue-300 border-blue-500'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading || !settings ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <>
          {tab === 'nucleo' && (
            <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
              <EditableSectionCard
                sectionKey="papel"
                content={settings.sections.papel.content}
                updatedBy={settings.sections.papel.updatedBy}
                updatedAt={settings.sections.papel.updatedAt}
                versioned={false}
              />
              <EscalaCard text={settings.escalaReferencia} />
              <EditableSectionCard
                sectionKey="fluxo"
                content={settings.sections.fluxo.content}
                updatedBy={settings.sections.fluxo.updatedBy}
                updatedAt={settings.sections.fluxo.updatedAt}
                versioned={false}
              />
              <EditableSectionCard
                sectionKey="gateA"
                content={settings.sections.gateA.content}
                updatedBy={settings.sections.gateA.updatedBy}
                updatedAt={settings.sections.gateA.updatedAt}
                versioned={VERSIONED_SECTIONS.has('gateA')}
              />
              <EditableSectionCard
                sectionKey="gateB"
                content={settings.sections.gateB.content}
                updatedBy={settings.sections.gateB.updatedBy}
                updatedAt={settings.sections.gateB.updatedAt}
                versioned={VERSIONED_SECTIONS.has('gateB')}
              />
              <EditableSectionCard
                sectionKey="regras"
                content={settings.sections.regras.content}
                updatedBy={settings.sections.regras.updatedBy}
                updatedAt={settings.sections.regras.updatedAt}
                versioned={VERSIONED_SECTIONS.has('regras')}
              />
              <VoiceRuleCard words={settings.forbiddenWords} />
              <EditableSectionCard
                sectionKey="instrucao"
                content={settings.sections.instrucao.content}
                updatedBy={settings.sections.instrucao.updatedBy}
                updatedAt={settings.sections.instrucao.updatedAt}
                versioned={false}
              />
            </div>
          )}

          {tab === 'adicionais' && (
            <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
              <div className="px-5 py-4 flex items-center gap-2 text-xs text-slate-500">
                <Lock size={12} />
                Anexadas ao final do prompt, depois do núcleo estrutural. Vale a partir da próxima
                interação do chat.
              </div>
              <EditableSectionCard
                sectionKey="adicionais"
                content={settings.sections.adicionais.content}
                updatedBy={settings.sections.adicionais.updatedBy}
                updatedAt={settings.sections.adicionais.updatedAt}
                versioned={false}
              />
            </div>
          )}

          {tab === 'simulador' && <SimuladorTab />}
        </>
      )}
    </section>
  )
}
