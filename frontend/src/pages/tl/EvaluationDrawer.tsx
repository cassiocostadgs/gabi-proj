import { useEffect, useRef, type ReactNode } from 'react'
import { X, Send, Check, RotateCcw } from 'lucide-react'
import { Spinner } from '../../components/Spinner'
import { competenciaLabel } from '../../lib/format'
import type { ChatMessage, SquadMember, TlEvaluation } from '../../types'
import {
  DIMENSIONS,
  GATE_A_CHIPS,
  isGateAQuestion,
  type EvalProposal,
  type MemberChatState,
} from './avaliacao-types'

const CLASSIF: Record<number, string> = {
  5: 'Excelente',
  4: 'Bom',
  3: 'Regular',
  2: 'Insatisfatório',
  1: 'Insatisfatório',
}

function scoreBadgeCls(nota: number): string {
  if (nota >= 4) return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
  if (nota === 3) return 'bg-amber-500/10 border-amber-500/30 text-amber-400'
  return 'bg-red-500/10 border-red-500/30 text-red-400'
}

function ScoreSelector({
  value,
  onChange,
}: Readonly<{ value: number; onChange: (n: number) => void }>) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors border ${
            value === n
              ? 'bg-blue-700 text-white border-blue-500'
              : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500 hover:text-slate-200'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

function ReadOnlyCard({
  eval: ev,
  onReopen,
}: Readonly<{ eval: TlEvaluation; onReopen: () => void }>) {
  return (
    <div className="bg-slate-800 border border-emerald-700/30 rounded-xl overflow-hidden">
      <div className="bg-slate-900/60 border-b border-slate-700 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-emerald-400">
        Avaliação confirmada (somente leitura)
      </div>
      {[
        {
          label: 'Comportamental',
          nota: ev.comportamentalNota,
          paragrafo: ev.comportamentalParagrafo,
        },
        { label: 'Técnica', nota: ev.tecnicaNota, paragrafo: ev.tecnicaParagrafo },
        { label: 'Prazos de Entrega', nota: ev.prazoNota, paragrafo: ev.prazoParagrafo },
      ].map(({ label, nota, paragrafo }) => (
        <div key={label} className="px-4 py-3 border-b border-slate-700/60">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-semibold text-slate-200">{label}</span>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${scoreBadgeCls(nota)}`}
            >
              {nota} · {CLASSIF[nota]}
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">{paragrafo}</p>
        </div>
      ))}
      <div className="px-4 py-3 bg-slate-900/40 flex justify-end">
        <button
          onClick={onReopen}
          className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
        >
          <RotateCcw size={12} />
          Reabrir avaliação
        </button>
      </div>
    </div>
  )
}

function ProposalCard({
  proposal,
  isConfirming,
  onUpdate,
  onConfirm,
}: Readonly<{
  proposal: EvalProposal
  isConfirming: boolean
  onUpdate: (patch: Partial<EvalProposal>) => void
  onConfirm: () => void
}>) {
  return (
    <div className="self-stretch bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      <div className="bg-slate-900/60 border-b border-slate-700 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
        Proposta de avaliação — revise antes de confirmar
      </div>
      {DIMENSIONS.map(({ label, notaKey, paraKey }) => {
        const nota = proposal[notaKey] as number
        return (
          <div key={label} className="px-4 py-3 border-b border-slate-700/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-200">{label}</span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${scoreBadgeCls(nota)}`}
              >
                {nota} · {CLASSIF[nota]}
              </span>
            </div>
            <div className="flex gap-2 items-start">
              <ScoreSelector value={nota} onChange={(n) => onUpdate({ [notaKey]: n })} />
              <textarea
                value={proposal[paraKey] as string}
                onChange={(e) => onUpdate({ [paraKey]: e.target.value })}
                rows={3}
                className="flex-1 bg-slate-950 border border-slate-600 rounded-lg text-xs text-slate-200 px-2.5 py-2 resize-none outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>
        )
      })}
      <div className="px-4 py-3 flex items-center justify-between bg-slate-900/40">
        <label className="flex items-center gap-2 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={proposal.janelaReduzida}
            onChange={(e) => onUpdate({ janelaReduzida: e.target.checked })}
            className="accent-blue-500"
          />
          <span className="text-xs text-slate-400">
            Janela reduzida (férias, licença, início tardio)
          </span>
        </label>
        <button
          onClick={onConfirm}
          disabled={isConfirming}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
        >
          {isConfirming ? <Spinner size="sm" /> : <Check size={14} />}
          Confirmar avaliação
        </button>
      </div>
    </div>
  )
}

interface Props {
  member: SquadMember
  competencia: string
  isClosed: boolean
  confirmedEval: TlEvaluation | undefined
  chat: MemberChatState
  userInput: string
  isSending: boolean
  isConfirming: boolean
  onInput: (v: string) => void
  onSend: (textOverride?: string) => void
  onUpdateProposal: (patch: Partial<EvalProposal>) => void
  onConfirm: () => void
  onReopenEvaluation: () => void
  onClose: () => void
}

export function EvaluationDrawer({
  member,
  competencia,
  isClosed,
  confirmedEval,
  chat,
  userInput,
  isSending,
  isConfirming,
  onInput,
  onSend,
  onUpdateProposal,
  onConfirm,
  onReopenEvaluation,
  onClose,
}: Readonly<Props>) {
  const threadEndRef = useRef<HTMLDivElement>(null)
  const messageKeys = useRef(new WeakMap<ChatMessage, string>()).current

  function keyForMessage(msg: ChatMessage): string {
    let key = messageKeys.get(msg)
    if (!key) {
      key = `${msg.role}-${crypto.randomUUID()}`
      messageKeys.set(msg, key)
    }
    return key
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    globalThis.addEventListener('keydown', handler)
    return () => globalThis.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.messages.length, chat.proposal])

  // Reopening a confirmed evaluation immediately drafts a proposal (see
  // AvaliacaoTab.handleReopenEvaluation) and fires an async request that un-confirms it and
  // reopens the squad's closure server-side. Until that request's query invalidation lands,
  // `confirmedEval`/`isClosed` still reflect the old state — a local draft must always win
  // over both, otherwise the read-only card or the "ciclo encerrado" message would swallow
  // the proposal card the TL just opened.
  const hasDraft = chat.proposal !== null
  const showReadOnly = !hasDraft && confirmedEval !== undefined
  const showClosedMessage = !hasDraft && !confirmedEval && isClosed
  const showEditor = !showReadOnly && !showClosedMessage
  const showComposer = showEditor
  const lastMsg = chat.messages[chat.messages.length - 1]
  const showGateAChips =
    !chat.proposal && lastMsg?.role === 'assistant' && isGateAQuestion(lastMsg.content)
  const isInitial = chat.messages.length === 0
  const isAwaitingReply = lastMsg?.role === 'assistant'

  let threadBody: ReactNode
  if (showReadOnly && confirmedEval) {
    threadBody = <ReadOnlyCard eval={confirmedEval} onReopen={onReopenEvaluation} />
  } else if (showClosedMessage) {
    threadBody = (
      <p className="text-center text-sm text-slate-600 italic mt-8">
        Ciclo encerrado — este profissional não foi avaliado nesta competência.
      </p>
    )
  } else {
    threadBody = (
      <>
        {chat.note ? (
          <p className="text-center text-[11px] text-slate-500 italic">{chat.note}</p>
        ) : (
          isInitial && (
            <p className="text-center text-[11px] text-slate-500 italic">
              Relate o mês de {member.nome.split(' ')[0]}. A IA pergunta de volta quando faltar
              evidência para nota 5 ou quando uma afirmação for genérica demais.
            </p>
          )
        )}
        {chat.messages.map((msg) => (
          <div
            key={keyForMessage(msg)}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[78%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-900/30 border border-blue-800/40 rounded-br-sm text-slate-100'
                  : 'bg-slate-800 border border-slate-700 rounded-bl-sm text-slate-200'
              }`}
            >
              {msg.role === 'assistant' && (
                <span className="block text-[10px] font-bold uppercase tracking-wide text-blue-400 mb-1">
                  IA · avaliação
                </span>
              )}
              {msg.content}
            </div>
          </div>
        ))}
        {showGateAChips && (
          <div className="flex gap-2 flex-wrap">
            {GATE_A_CHIPS.map((label) => (
              <button
                key={label}
                onClick={() => onSend(label)}
                className="px-3 py-1.5 rounded-full border border-slate-600 text-slate-300 text-xs font-semibold hover:bg-slate-700/60 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {isSending && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5">
              <Spinner size="sm" />
            </div>
          </div>
        )}
        {chat.proposal && (
          <ProposalCard
            proposal={chat.proposal}
            isConfirming={isConfirming}
            onUpdate={onUpdateProposal}
            onConfirm={onConfirm}
          />
        )}
        <div ref={threadEndRef} />
      </>
    )
  }

  let composerHint: string
  if (chat.proposal) {
    composerHint =
      'Ajuste nota e parágrafo acima, depois confirme — ou adicione mais contexto aqui.'
  } else if (isAwaitingReply) {
    composerHint = 'Responda à pergunta da IA (ou use os botões, se houver).'
  } else {
    composerHint = 'Relate em texto livre o mês deste profissional.'
  }

  return (
    <>
      <button
        type="button"
        aria-label="Fechar"
        className="fixed inset-0 bg-black/50 z-40 cursor-default"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-slate-900 border-l border-slate-700 z-50 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
          <div className="min-w-0">
            <p className="font-semibold text-slate-100 text-sm truncate">{member.nome}</p>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {member.papel} · {competenciaLabel(competencia)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">{threadBody}</div>

        {showComposer && (
          <div className="border-t border-slate-700 bg-slate-800/60 p-4 shrink-0">
            {chat.error && <p className="text-xs text-red-400 mb-2">{chat.error}</p>}
            <p className="text-[11px] text-slate-500 mb-2">{composerHint}</p>
            <div className="flex gap-2">
              <textarea
                value={userInput}
                onChange={(e) => onInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    onSend()
                  }
                }}
                rows={2}
                disabled={isSending}
                placeholder={
                  isInitial
                    ? `Ex: ${member.nome.split(' ')[0]} entregou tudo dentro do prazo e foi muito proativo este mês.`
                    : 'Mensagem...'
                }
                className="flex-1 bg-slate-950 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors resize-none disabled:opacity-50"
              />
              <button
                onClick={() => onSend()}
                disabled={!userInput.trim() || isSending}
                className="px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors shrink-0"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
