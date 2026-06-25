import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Send, CheckCircle } from 'lucide-react'
import { Layout } from '../../components/Layout'
import { Spinner } from '../../components/Spinner'
import { pendingSubmission } from '../../lib/pendingSubmission'
import { billingService } from '../../services/billing.service'
import { PersonCard } from '../../components/PersonCard'
import type { Person, ResultsNavigationState } from '../../types'

export function ResultsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const result = location.state as ResultsNavigationState | null
  const competencia = result?.competencia
  const pending = pendingSubmission.get()

  const [submitMsg, setSubmitMsg] = useState('')

  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ['submission-status', competencia],
    queryFn: () => billingService.getSubmissionStatus(competencia!),
    enabled: !!competencia,
  })

  const submitMutation = useMutation({
    mutationFn: () => billingService.submit(pending!.gaFile, competencia!, result!),
    onSuccess: () => {
      setSubmitMsg('Enviado para aprovação.')
      pendingSubmission.clear()
      refetchStatus()
    },
    onError: () => setSubmitMsg('Erro ao enviar. Tente novamente.'),
  })

  if (!result) {
    navigate('/validate', { replace: true })
    return null
  }

  const { persons, errors } = result
  const totalErrors = persons.reduce((s: number, p: Person) => s + p.errors_count, 0)
  const monthLabel = persons[0]?.month_label ?? ''
  const canSubmit = persons.length > 0 && !!competencia && !!pending?.gaFile
  const alreadySubmitted = statusData?.submitted && statusData.status !== 'rejected'
  const wasRejected = statusData?.status === 'rejected'

  return (
    <Layout
      title="Resultado"
      subtitle={monthLabel}
      actions={
        <>
          <button
            onClick={() => navigate('/validate')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-slate-300 border border-slate-600 hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft size={13} /> Nova validação
          </button>
          {canSubmit && !alreadySubmitted && (
            <button
              onClick={() => {
                setSubmitMsg('')
                submitMutation.mutate()
              }}
              disabled={submitMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white transition-colors"
              title={wasRejected ? 'Re-submeter após rejeição' : 'Submeter para aprovação do admin'}
            >
              {submitMutation.isPending ? <Spinner size="sm" /> : <Send size={13} />}
              {wasRejected ? 'Re-submeter' : 'Submeter para aprovação'}
            </button>
          )}
          {alreadySubmitted && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border border-emerald-700/50 bg-emerald-950 text-emerald-300">
              <CheckCircle size={11} /> Enviado
            </span>
          )}
          {submitMsg && (
            <span
              className={`text-xs ${submitMsg.startsWith('Erro') ? 'text-red-400' : 'text-emerald-400'}`}
            >
              {submitMsg}
            </span>
          )}
          {totalErrors === 0 && persons.length > 0 ? (
            <span className="bg-green-950 text-green-300 border border-green-800 text-xs font-bold px-2.5 py-1 rounded-full">
              Tudo OK
            </span>
          ) : totalErrors > 0 ? (
            <span className="bg-red-900 text-red-300 border border-red-800 text-xs font-bold px-2.5 py-1 rounded-full">
              {totalErrors} erro{totalErrors > 1 ? 's' : ''}
            </span>
          ) : null}
        </>
      }
    >
      <div className="max-w-7xl mx-auto px-6 py-5">
        {errors.length > 0 && (
          <div className="bg-red-950 border border-red-800 rounded-xl px-5 py-4 mb-5">
            <strong className="block text-red-400 text-sm mb-1">Avisos de processamento</strong>
            {errors.map((e, i) => (
              <p key={i} className="text-xs text-red-300">
                {e}
              </p>
            ))}
          </div>
        )}

        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Pessoas validadas ({persons.length})
        </p>

        {persons.map((p) => (
          <PersonCard key={p.task_id} person={p} />
        ))}

        {persons.length === 0 && errors.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-10">Nenhum resultado.</p>
        )}
      </div>
    </Layout>
  )
}
