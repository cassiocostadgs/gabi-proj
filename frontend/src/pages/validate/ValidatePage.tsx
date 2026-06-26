import { useState, useRef, DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, X, Pencil, AlertTriangle, CircleAlert } from 'lucide-react'
import { Layout } from '../../components/Layout'
import { MonthPicker } from '../../components/MonthPicker'
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

function normalizeStr(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

const YEAR_REGEX = /(?<!\d)(20[2-9]\d)(?!\d)/
const YYYYMM_REGEX = /(?<!\d)(20[2-9]\d)[_-](\d{2})(?!\d)/
const MMYYYY_REGEX = /(?<!\d)(\d{2})[_-](20[2-9]\d)(?!\d)/

function parseCompetencia(filename: string): string {
  const now = new Date()
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevYear = String(prevDate.getFullYear())
  const prevMonth = String(prevDate.getMonth() + 1).padStart(2, '0')
  const name = normalizeStr(filename)

  // (?<!\d) / (?!\d) instead of \b — \b treats underscore as word char, breaking _2026_03_ patterns
  const yearMatch = YEAR_REGEX.exec(name)
  const year = yearMatch?.[1] ?? prevYear

  for (const [ptName, num] of Object.entries(MONTHS_PT)) {
    if (name.includes(normalizeStr(ptName))) return `${year}-${num}`
  }

  const yyyymmMatch = YYYYMM_REGEX.exec(name)
  if (yyyymmMatch) {
    const m = Number.parseInt(yyyymmMatch[2], 10)
    if (m >= 1 && m <= 12) return `${yyyymmMatch[1]}-${yyyymmMatch[2]}`
  }

  const mmyyyyMatch = MMYYYY_REGEX.exec(name)
  if (mmyyyyMatch) {
    const m = Number.parseInt(mmyyyyMatch[1], 10)
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

function SpreadsheetIcon({ className }: Readonly<{ className?: string }>) {
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

interface CompetenciaModalProps {
  pendingFiles: File[]
  modalCompetencia: string
  modalPickerYear: number
  showModalPicker: boolean
  onPickerYearChange: (delta: number) => void
  onMonthSelect: (competencia: string) => void
  onTogglePicker: () => void
  onConfirm: () => void
  onCancel: () => void
}

function CompetenciaModal({
  pendingFiles,
  modalCompetencia,
  modalPickerYear,
  showModalPicker,
  onPickerYearChange,
  onMonthSelect,
  onTogglePicker,
  onConfirm,
  onCancel,
}: Readonly<CompetenciaModalProps>) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        className="absolute inset-0 bg-black/60 cursor-default border-0"
        onClick={onCancel}
        aria-label="Fechar modal"
      />
      <div className="relative bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl">
        <h3 className="text-sm font-semibold text-slate-200 mb-1">Confirmar competência</h3>
        <p className="text-xs text-slate-500 mb-4 truncate">
          {pendingFiles.length === 1
            ? pendingFiles[0].name
            : `${pendingFiles.length} arquivos selecionados`}
        </p>

        <p className="text-xs font-medium text-slate-400 mb-1.5">Competência</p>
        <button
          onClick={onTogglePicker}
          className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-100 border transition-colors mb-2 ${
            showModalPicker
              ? 'bg-slate-900 border-indigo-500'
              : 'bg-slate-900 border-slate-600 hover:border-indigo-500'
          }`}
        >
          <span>{competenciaLabel(modalCompetencia)}</span>
          <Pencil size={12} className="text-slate-500 shrink-0 ml-2" />
        </button>

        {showModalPicker && (
          <div className="mb-4">
            <MonthPicker
              pickerYear={modalPickerYear}
              selectedCompetencia={modalCompetencia}
              onYearChange={(delta) => onPickerYearChange(delta)}
              onMonthSelect={(comp) => {
                onMonthSelect(comp)
              }}
            />
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!modalCompetencia}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            <Check size={14} />
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

interface DropZoneProps {
  gaFiles: File[]
  dragOver: boolean
  fileInputRef: React.RefObject<HTMLInputElement>
  onFilesPicked: (files: FileList | File[]) => void
  onDragOver: () => void
  onDragLeave: () => void
  onRemoveAll: () => void
  onRemoveFile: (i: number) => void
}

function DropZone({
  gaFiles,
  dragOver,
  fileInputRef,
  onFilesPicked,
  onDragOver,
  onDragLeave,
  onRemoveAll,
  onRemoveFile,
}: Readonly<DropZoneProps>) {
  const hasFiles = gaFiles.length > 0

  let dropZoneBorderClass: string
  if (hasFiles) {
    dropZoneBorderClass = 'border-emerald-600/60 border-solid bg-emerald-950/50 cursor-default'
  } else if (dragOver) {
    dropZoneBorderClass = 'border-indigo-500 border-dashed bg-indigo-500/10 cursor-pointer'
  } else {
    dropZoneBorderClass =
      'border-slate-700 border-dashed bg-slate-800/60 hover:border-indigo-500 hover:bg-indigo-500/5 cursor-pointer'
  }

  let iconBgClass: string
  if (hasFiles) {
    iconBgClass = 'bg-emerald-900/60'
  } else if (dragOver) {
    iconBgClass = 'bg-indigo-500/15'
  } else {
    iconBgClass = 'bg-slate-700'
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    onDragLeave()
    onFilesPicked(e.dataTransfer.files)
  }

  return (
    <div>
      <div className="mb-1.5">
        <p className="text-xs font-medium text-slate-400">Arquivo GA</p>
      </div>

      <button
        className={`relative border-2 rounded-xl px-6 py-10 text-center transition-all flex flex-col items-center gap-2.5 w-full ${dropZoneBorderClass}`}
        onClick={hasFiles ? undefined : () => fileInputRef.current?.click()}
        onKeyDown={(e) => !hasFiles && e.key === 'Enter' && fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          onDragOver()
        }}
        onDragLeave={onDragLeave}
        onDrop={handleDrop}
        aria-label={hasFiles ? undefined : 'Selecionar arquivo GA'}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xls,.xlsx"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && onFilesPicked(e.target.files)}
        />

        {hasFiles && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemoveAll()
            }}
            className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-md text-slate-500 hover:text-red-400 hover:bg-red-950/60 transition-colors"
            title="Remover arquivo"
          >
            <X size={14} />
          </button>
        )}

        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${iconBgClass}`}
        >
          <SpreadsheetIcon />
        </div>

        {hasFiles ? (
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
      </button>

      {gaFiles.length > 1 && (
        <ul className="mt-2 space-y-1.5">
          {gaFiles.map((f) => (
            <li
              key={f.name}
              className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
            >
              <p className="text-xs text-slate-300 truncate flex-1">{f.name}</p>
              <button
                onClick={() => onRemoveFile(gaFiles.indexOf(f))}
                className="text-slate-600 hover:text-red-400 transition-colors"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ValidatePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
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
      qc.removeQueries({ queryKey: ['submission-status', selectedCompetencia] })
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
    setModalPickerYear(Number.parseInt(comp.split('-')[0], 10))
    setShowModalPicker(false)
    setShowModal(true)
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

  const selEditYear = selectedCompetencia
    ? Number.parseInt(selectedCompetencia.split('-')[0], 10)
    : null
  const selEditMonth = selectedCompetencia
    ? Number.parseInt(selectedCompetencia.split('-')[1], 10)
    : null

  function btnLabel() {
    if (mutation.isPending) return null
    if (isOfflineNone || isOfflineMismatch) return 'Validação indisponível — veja o aviso abaixo'
    if (!gaFiles.length) return 'Selecione um arquivo GA para continuar'
    return 'Validar apontamentos'
  }

  const taskBadgeClass = oracleAvailable
    ? 'border-emerald-500/25 bg-emerald-500/6 text-slate-400'
    : 'border-amber-500/30 bg-amber-500/8 text-amber-400'

  const taskDotClass = oracleAvailable
    ? 'bg-emerald-400 shadow-[0_0_0_2px_rgba(16,185,129,0.22)]'
    : 'bg-amber-400 shadow-[0_0_0_2px_rgba(234,179,8,0.22)]'

  return (
    <Layout>
      <div className="flex justify-center px-4 pt-[12vh] pb-12">
        <div className="w-full max-w-[520px] flex flex-col gap-4">
          {/* Header */}
          <div className="mb-1">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-lg font-semibold text-slate-100">Validar apontamentos</h1>
              <div
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium shrink-0 ${taskBadgeClass}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${taskDotClass}`} />
                {oracleAvailable ? 'Task DB · conectado' : 'Task DB · indisponível'}
              </div>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Envie o arquivo GA para cruzar com as horas faturadas no Task.
            </p>
          </div>

          {/* Drop zone */}
          <DropZone
            gaFiles={gaFiles}
            dragOver={dragOver}
            fileInputRef={fileInputRef}
            onFilesPicked={handleFilesPicked}
            onDragOver={() => setDragOver(true)}
            onDragLeave={() => setDragOver(false)}
            onRemoveAll={() => {
              setGaFiles([])
              setSelectedCompetencia(undefined)
            }}
            onRemoveFile={removeFile}
          />

          {/* Competência picker */}
          {selectedCompetencia && (
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1.5">Competência</p>
              <button
                onClick={() => {
                  if (!showEditPicker)
                    setEditPickerYear(Number.parseInt(selectedCompetencia.split('-')[0], 10))
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
                  <MonthPicker
                    pickerYear={editPickerYear}
                    selectedCompetencia={`${selEditYear}-${String(selEditMonth).padStart(2, '0')}`}
                    onYearChange={(delta) => setEditPickerYear((y) => y + delta)}
                    onMonthSelect={(comp) => {
                      setSelectedCompetencia(comp)
                      setShowEditPicker(false)
                    }}
                  />
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
        <CompetenciaModal
          pendingFiles={pendingFiles}
          modalCompetencia={modalCompetencia}
          modalPickerYear={modalPickerYear}
          showModalPicker={showModalPicker}
          onPickerYearChange={(delta) => setModalPickerYear((y) => y + delta)}
          onMonthSelect={(comp) => {
            setModalCompetencia(comp)
            setShowModalPicker(false)
          }}
          onTogglePicker={() => {
            if (!showModalPicker)
              setModalPickerYear(Number.parseInt(modalCompetencia.split('-')[0], 10))
            setShowModalPicker((v) => !v)
          }}
          onConfirm={handleModalConfirm}
          onCancel={handleModalCancel}
        />
      )}
    </Layout>
  )
}
