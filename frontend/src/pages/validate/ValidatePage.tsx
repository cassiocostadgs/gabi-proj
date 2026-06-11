import { useState, useRef, DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Pencil,
  AlertTriangle,
  CircleAlert,
} from 'lucide-react'
import { Layout } from '../../components/Layout'
import { Spinner } from '../../components/Spinner'
import { validateService } from '../../services/validate.service'
import { competenciaLabel } from '../../lib/format'
import { pendingSubmission } from '../../lib/pendingSubmission'
import type { Competencia, TaskStatus } from '../../types'
import axios from 'axios'

const MONTHS_PT: Record<string, string> = {
  janeiro: '01',
  fevereiro: '02',
  março: '03',
  marco: '03',
  abril: '04',
  maio: '05',
  junho: '06',
  julho: '07',
  agosto: '08',
  setembro: '09',
  outubro: '10',
  novembro: '11',
  dezembro: '12',
}

const MONTH_ABBR = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

function normalizeStr(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function parseCompetencia(filename: string): string {
  const now = new Date()
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevYear = String(prevDate.getFullYear())
  const prevMonth = String(prevDate.getMonth() + 1).padStart(2, '0')
  const name = normalizeStr(filename)

  // (?<!\d) / (?!\d) instead of \b — \b treats underscore as word char, breaking _2026_03_ patterns
  const yearMatch = name.match(/(?<!\d)(20[2-9]\d)(?!\d)/)
  const year = yearMatch?.[1] ?? prevYear

  for (const [ptName, num] of Object.entries(MONTHS_PT)) {
    if (name.includes(normalizeStr(ptName))) return `${year}-${num}`
  }

  const yyyymmMatch = name.match(/(?<!\d)(20[2-9]\d)[_-](\d{2})(?!\d)/)
  if (yyyymmMatch) {
    const m = parseInt(yyyymmMatch[2], 10)
    if (m >= 1 && m <= 12) return `${yyyymmMatch[1]}-${yyyymmMatch[2]}`
  }

  const mmyyyyMatch = name.match(/(?<!\d)(\d{2})[_-](20[2-9]\d)(?!\d)/)
  if (mmyyyyMatch) {
    const m = parseInt(mmyyyyMatch[1], 10)
    if (m >= 1 && m <= 12) return `${mmyyyyMatch[2]}-${mmyyyyMatch[1]}`
  }

  return `${prevYear}-${prevMonth}`
}

function monthDateRange(competencia: string) {
  const [y, m] = competencia.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    startDate: `${competencia}-01`,
    endDate: `${competencia}-${String(lastDay).padStart(2, '0')}`,
  }
}

function SpreadsheetIcon({ className }: { className?: string }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="32" height="32" rx="6" fill="#1D6F42" />
      <rect
        x="7"
        y="7"
        width="18"
        height="18"
        rx="1.5"
        stroke="white"
        strokeWidth="1.5"
        strokeOpacity="0.6"
        fill="none"
      />
      <line x1="7" y1="13" x2="25" y2="13" stroke="white" strokeWidth="1.2" strokeOpacity="0.5" />
      <line x1="7" y1="19" x2="25" y2="19" stroke="white" strokeWidth="1.2" strokeOpacity="0.5" />
      <line x1="14" y1="7" x2="14" y2="25" stroke="white" strokeWidth="1.2" strokeOpacity="0.5" />
      <rect x="7" y="7" width="7" height="6" rx="1.5" fill="white" fillOpacity="0.25" />
    </svg>
  )
}

export function ValidatePage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [gaFiles, setGaFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [selectedCompetencia, setSelectedCompetencia] = useState<string | undefined>()

  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [showModal, setShowModal] = useState(false)
  const [modalCompetencia, setModalCompetencia] = useState('')
  const [modalPickerYear, setModalPickerYear] = useState(new Date().getFullYear())
  const [showModalPicker, setShowModalPicker] = useState(false)

  const [showEditPicker, setShowEditPicker] = useState(false)
  const [editPickerYear, setEditPickerYear] = useState(new Date().getFullYear())

  const { data: oracleAvailable = false } = useQuery({
    queryKey: ['oracle-status'],
    queryFn: validateService.getOracleStatus,
  })

  const { data: taskStatus } = useQuery<TaskStatus>({
    queryKey: ['task-status'],
    queryFn: validateService.getTaskStatus,
    enabled: !oracleAvailable,
    refetchInterval: 60_000,
  })

  const { data: competencias = [] } = useQuery<Competencia[]>({
    queryKey: ['competencias'],
    queryFn: validateService.getCompetencias,
    enabled: !oracleAvailable,
  })

  const { startDate, endDate } = selectedCompetencia
    ? monthDateRange(selectedCompetencia)
    : { startDate: '', endDate: '' }

  // Fallback is automatic — triggered whenever oracle is down and file is available
  const useFileFallback = !oracleAvailable && (taskStatus?.available ?? false)
  const taskFileAvailable =
    useFileFallback && competencias.some((c) => c.competencia === selectedCompetencia)
  const taskFileCompetencia = taskStatus?.competencia

  // Derive scenario
  const isOffline = !oracleAvailable
  const isOfflineOk = isOffline && useFileFallback && (!selectedCompetencia || taskFileAvailable)
  const isOfflineMismatch =
    isOffline && useFileFallback && !!selectedCompetencia && !taskFileAvailable
  const isOfflineNone = isOffline && !useFileFallback

  const mutation = useMutation({
    mutationFn: () =>
      validateService.validate(gaFiles, startDate, endDate, useFileFallback, selectedCompetencia),
    onSuccess: (data) => {
      if (gaFiles[0] && selectedCompetencia) {
        pendingSubmission.set(gaFiles[0], selectedCompetencia)
      }
      navigate('/results', { state: { ...data, competencia: selectedCompetencia } })
    },
    onError: (err: unknown) => {
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail
        const status = err.response?.status
        setError(detail ?? `Erro ao validar. (${status ?? err.message})`)
      } else if (err instanceof Error) {
        setError(`Erro inesperado: ${err.message}`)
      } else {
        setError('Erro inesperado.')
      }
    },
  })

  const canValidate =
    gaFiles.length > 0 &&
    !!selectedCompetencia &&
    !mutation.isPending &&
    (oracleAvailable || (useFileFallback && taskFileAvailable))

  function handleFilesPicked(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.name.endsWith('.xls') || f.name.endsWith('.xlsx'))
    if (!arr.length) return
    const empty = arr.filter((f) => f.size === 0)
    if (empty.length) {
      setError(
        `Arquivo(s) sem conteúdo: ${empty.map((f) => f.name).join(', ')}. ` +
          'O arquivo pode não estar disponível localmente — verifique se foi sincronizado antes de enviar.'
      )
      return
    }
    const comp = parseCompetencia(arr[0].name)
    setPendingFiles(arr)
    setModalCompetencia(comp)
    setModalPickerYear(parseInt(comp.split('-')[0], 10))
    setShowModalPicker(false)
    setShowModal(true)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFilesPicked(e.dataTransfer.files)
  }

  function handleModalConfirm() {
    setGaFiles((prev) => [...prev, ...pendingFiles])
    setSelectedCompetencia(modalCompetencia)
    setShowEditPicker(false)
    setPendingFiles([])
    setShowModal(false)
  }

  function handleModalCancel() {
    setPendingFiles([])
    setShowModal(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (i: number) => {
    setGaFiles((prev) => {
      const next = prev.filter((_, idx) => idx !== i)
      if (next.length === 0) {
        setSelectedCompetencia(undefined)
        setShowEditPicker(false)
      }
      return next
    })
  }

  const selEditYear = selectedCompetencia ? parseInt(selectedCompetencia.split('-')[0], 10) : null
  const selEditMonth = selectedCompetencia ? parseInt(selectedCompetencia.split('-')[1], 10) : null

  function btnLabel() {
    if (mutation.isPending) return null
    if (isOfflineNone || isOfflineMismatch) return 'Validação indisponível — veja o aviso abaixo'
    if (!gaFiles.length) return 'Selecione um arquivo GA para continuar'
    return 'Validar apontamentos'
  }

  return (
    <Layout>
      <div className="flex justify-center px-4 pt-[12vh] pb-12">
        <div className="w-full max-w-[520px] flex flex-col gap-4">
          {/* Header */}
          <div className="mb-1">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-lg font-semibold text-slate-100">Validar apontamentos</h1>
              <div
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium shrink-0 ${
                  oracleAvailable
                    ? 'border-emerald-500/25 bg-emerald-500/6 text-slate-400'
                    : 'border-amber-500/30 bg-amber-500/8 text-amber-400'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    oracleAvailable
                      ? 'bg-emerald-400 shadow-[0_0_0_2px_rgba(16,185,129,0.22)]'
                      : 'bg-amber-400 shadow-[0_0_0_2px_rgba(234,179,8,0.22)]'
                  }`}
                />
                {oracleAvailable ? 'Task DB · conectado' : 'Task DB · indisponível'}
              </div>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Envie o arquivo GA para cruzar com as horas faturadas no Task.
            </p>
          </div>

          {/* Drop zone */}
          <div>
            {/* Label */}
            <div className="mb-1.5">
              <p className="text-xs font-medium text-slate-400">Arquivo GA</p>
            </div>

            {/* Dropzone */}
            <div
              className={`relative border-2 rounded-xl px-6 py-10 text-center transition-all flex flex-col items-center gap-2.5 ${
                gaFiles.length > 0
                  ? 'border-emerald-600/60 border-solid bg-emerald-950/50 cursor-default'
                  : dragOver
                    ? 'border-indigo-500 border-dashed bg-indigo-500/10 cursor-pointer'
                    : 'border-slate-700 border-dashed bg-slate-800/60 hover:border-indigo-500 hover:bg-indigo-500/5 cursor-pointer'
              }`}
              role={gaFiles.length > 0 ? undefined : 'button'}
              tabIndex={gaFiles.length > 0 ? undefined : 0}
              onClick={gaFiles.length > 0 ? undefined : () => fileInputRef.current?.click()}
              onKeyDown={(e) =>
                gaFiles.length === 0 && e.key === 'Enter' && fileInputRef.current?.click()
              }
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xls,.xlsx"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && handleFilesPicked(e.target.files)}
              />

              {/* X button — só quando tem arquivo */}
              {gaFiles.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    gaFiles.forEach((_, i) => removeFile(i))
                    setGaFiles([])
                    setSelectedCompetencia(undefined)
                  }}
                  className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-md text-slate-500 hover:text-red-400 hover:bg-red-950/60 transition-colors"
                  title="Remover arquivo"
                >
                  <X size={14} />
                </button>
              )}

              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                  gaFiles.length > 0
                    ? 'bg-emerald-900/60'
                    : dragOver
                      ? 'bg-indigo-500/15'
                      : 'bg-slate-700'
                }`}
              >
                <SpreadsheetIcon />
              </div>

              {gaFiles.length > 0 ? (
                <>
                  <p className="text-sm font-medium text-emerald-400 truncate max-w-[320px]">
                    {gaFiles[0].name}
                    {gaFiles.length > 1 && ` +${gaFiles.length - 1}`}
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Clique para trocar
                  </button>
                </>
              ) : (
                <p className="text-sm font-medium text-slate-200">
                  Clique para selecionar, ou arraste o relatório do GA (.xls)
                </p>
              )}
            </div>

            {/* File list (when multiple) */}
            {gaFiles.length > 1 && (
              <ul className="mt-2 space-y-1.5">
                {gaFiles.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
                  >
                    <p className="text-xs text-slate-300 truncate flex-1">{f.name}</p>
                    <button
                      onClick={() => removeFile(i)}
                      className="text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Competência picker */}
          {selectedCompetencia && (
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1.5">Competência</p>
              <button
                onClick={() => {
                  if (!showEditPicker)
                    setEditPickerYear(parseInt(selectedCompetencia.split('-')[0], 10))
                  setShowEditPicker((v) => !v)
                }}
                className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-100 border transition-colors ${
                  showEditPicker
                    ? 'bg-slate-900 border-indigo-500'
                    : 'bg-slate-900 border-slate-700 hover:border-indigo-500'
                }`}
              >
                <span>{competenciaLabel(selectedCompetencia)}</span>
                <Pencil size={12} className="text-slate-500 shrink-0 ml-2" />
              </button>

              {showEditPicker && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => setEditPickerYear((y) => y - 1)}
                      className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm font-semibold text-slate-200">{editPickerYear}</span>
                    <button
                      onClick={() => setEditPickerYear((y) => y + 1)}
                      className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {MONTH_ABBR.map((abbr, i) => {
                      const monthNum = i + 1
                      const isSelected = selEditYear === editPickerYear && selEditMonth === monthNum
                      return (
                        <button
                          key={abbr}
                          onClick={() => {
                            setSelectedCompetencia(
                              `${editPickerYear}-${String(monthNum).padStart(2, '0')}`
                            )
                            setShowEditPicker(false)
                          }}
                          className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                          }`}
                        >
                          {abbr}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Validation error */}
          {error && (
            <div className="bg-red-950/60 border border-red-800/50 rounded-lg px-4 py-3 text-sm text-red-300">
              <strong className="block text-red-400 mb-0.5">Erro</strong>
              {error}
            </div>
          )}

          {/* Primary button */}
          <button
            onClick={() => {
              setError('')
              mutation.mutate()
            }}
            disabled={!canValidate || mutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-[11px] rounded-lg text-sm font-medium transition-all bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white"
          >
            {mutation.isPending ? (
              <>
                <Spinner size="sm" /> Validando…
              </>
            ) : (
              <>
                <Check size={15} strokeWidth={2.5} />
                {btnLabel()}
              </>
            )}
          </button>

          {/* Alerts — below the button */}
          {isOfflineOk && selectedCompetencia && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-4 py-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                <p className="text-xs font-semibold text-amber-400">
                  Task DB indisponível — usando arquivo de contingência
                </p>
              </div>
              <p className="text-xs text-slate-400 pl-[22px] leading-relaxed">
                Validando com o arquivo Task enviado pelo administrador{' '}
                {taskFileCompetencia && (
                  <strong className="text-slate-200">
                    {competenciaLabel(taskFileCompetencia)}
                  </strong>
                )}
                . Os dados podem não refletir alterações recentes.
              </p>
            </div>
          )}

          {isOfflineMismatch && (
            <div className="rounded-lg border border-red-500/25 bg-red-500/8 px-4 py-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <CircleAlert size={14} className="text-red-400 shrink-0" />
                <p className="text-xs font-semibold text-red-400">Competência incompatível</p>
              </div>
              <p className="text-xs text-slate-400 pl-[22px] leading-relaxed">
                O Task DB está fora do ar. O arquivo Task disponível cobre{' '}
                {taskFileCompetencia && (
                  <strong className="text-slate-200">
                    {competenciaLabel(taskFileCompetencia)}
                  </strong>
                )}
                , mas seu GA é de{' '}
                {selectedCompetencia && (
                  <strong className="text-slate-200">
                    {competenciaLabel(selectedCompetencia)}
                  </strong>
                )}
                . Não é possível cruzar períodos diferentes. Solicite ao administrador que envie o
                arquivo Task para esse período.
              </p>
            </div>
          )}

          {isOfflineNone && (
            <div className="rounded-lg border border-red-500/25 bg-red-500/8 px-4 py-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <CircleAlert size={14} className="text-red-400 shrink-0" />
                <p className="text-xs font-semibold text-red-400">Validação indisponível</p>
              </div>
              <p className="text-xs text-slate-400 pl-[22px] leading-relaxed">
                O Task DB está fora do ar e nenhum arquivo Task foi enviado pelo administrador.
                Solicite o envio do arquivo para continuar.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Competência modal */}
      {showModal && pendingFiles.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={handleModalCancel} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-200 mb-1">Confirmar competência</h3>
            <p className="text-xs text-slate-500 mb-4 truncate">
              {pendingFiles.length === 1
                ? pendingFiles[0].name
                : `${pendingFiles.length} arquivos selecionados`}
            </p>

            <p className="text-xs font-medium text-slate-400 mb-1.5">Competência</p>
            <button
              onClick={() => {
                if (!showModalPicker)
                  setModalPickerYear(parseInt(modalCompetencia.split('-')[0], 10))
                setShowModalPicker((v) => !v)
              }}
              className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-100 border transition-colors mb-2 ${
                showModalPicker
                  ? 'bg-slate-900 border-indigo-500'
                  : 'bg-slate-900 border-slate-600 hover:border-indigo-500'
              }`}
            >
              <span>{competenciaLabel(modalCompetencia)}</span>
              <Pencil size={12} className="text-slate-500 shrink-0 ml-2" />
            </button>

            {showModalPicker &&
              (() => {
                const selParts = modalCompetencia.split('-')
                const selYear = selParts[0] ? parseInt(selParts[0], 10) : null
                const selMonth = selParts[1] ? parseInt(selParts[1], 10) : null
                return (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <button
                        onClick={() => setModalPickerYear((y) => y - 1)}
                        className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="text-sm font-semibold text-slate-200">
                        {modalPickerYear}
                      </span>
                      <button
                        onClick={() => setModalPickerYear((y) => y + 1)}
                        className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {MONTH_ABBR.map((abbr, i) => {
                        const monthNum = i + 1
                        const isSelected = selYear === modalPickerYear && selMonth === monthNum
                        return (
                          <button
                            key={abbr}
                            onClick={() => {
                              setModalCompetencia(
                                `${modalPickerYear}-${String(monthNum).padStart(2, '0')}`
                              )
                              setShowModalPicker(false)
                            }}
                            className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              isSelected
                                ? 'bg-indigo-600 text-white'
                                : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                            }`}
                          >
                            {abbr}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

            <div className="flex gap-2 justify-end">
              <button
                onClick={handleModalCancel}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleModalConfirm}
                disabled={!modalCompetencia}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                <Check size={14} />
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
