import { useState, useRef, useEffect, DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Upload,
  X,
  Database,
  FileSpreadsheet,
  AlertTriangle,
  HardDriveUpload,
  ChevronLeft,
  ChevronRight,
  Pencil,
} from 'lucide-react'
import { Layout } from '../../components/Layout'
import { Spinner } from '../../components/Spinner'
import { validateService } from '../../services/validate.service'
import { competenciaLabel } from '../../lib/format'
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
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

  // YYYY-MM or YYYY_MM (e.g. GA_Name_2026_03.xls)
  const yyyymmMatch = name.match(/(?<!\d)(20[2-9]\d)[_-](\d{2})(?!\d)/)
  if (yyyymmMatch) {
    const m = parseInt(yyyymmMatch[2], 10)
    if (m >= 1 && m <= 12) return `${yyyymmMatch[1]}-${yyyymmMatch[2]}`
  }

  // MM-YYYY or MM_YYYY (e.g. Name 05-2026.xls)
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

export function ValidatePage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [gaFiles, setGaFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [selectedCompetencia, setSelectedCompetencia] = useState<string | undefined>()
  const [useFileFallback, setUseFileFallback] = useState(false)

  // Modal state (triggered by file add)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [showModal, setShowModal] = useState(false)
  const [modalCompetencia, setModalCompetencia] = useState('')
  const [modalPickerYear, setModalPickerYear] = useState(new Date().getFullYear())
  const [showModalPicker, setShowModalPicker] = useState(false)

  // Inline picker state (change competência after confirmation)
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
    enabled: useFileFallback,
  })

  useEffect(() => {
    if (oracleAvailable) setUseFileFallback(false)
  }, [oracleAvailable])

  const { startDate, endDate } = selectedCompetencia
    ? monthDateRange(selectedCompetencia)
    : { startDate: '', endDate: '' }

  const mutation = useMutation({
    mutationFn: () =>
      validateService.validate(gaFiles, startDate, endDate, useFileFallback, selectedCompetencia),
    onSuccess: (data) => navigate('/results', { state: data }),
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

  const taskFileAvailable =
    useFileFallback && competencias.some((c) => c.competencia === selectedCompetencia)

  const canValidate =
    gaFiles.length > 0 &&
    !!selectedCompetencia &&
    (oracleAvailable || (useFileFallback && taskFileAvailable))

  const selEditYear = selectedCompetencia ? parseInt(selectedCompetencia.split('-')[0], 10) : null
  const selEditMonth = selectedCompetencia ? parseInt(selectedCompetencia.split('-')[1], 10) : null

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-6 py-7">
        {/* Task source status */}
        {oracleAvailable ? (
          <div className="flex items-start gap-3 bg-green-950 border border-green-800 rounded-xl px-4 py-3.5 mb-6">
            <Database size={18} className="text-green-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-300">Task DB conectado</p>
              <p className="text-xs text-green-700 mt-0.5">
                Dados buscados diretamente do Task para o período selecionado.
              </p>
            </div>
          </div>
        ) : !useFileFallback ? (
          <div className="flex items-start gap-3 bg-amber-950 border border-amber-800 rounded-xl px-4 py-3.5 mb-6">
            <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-300">Task DB indisponível</p>
              <p className="text-xs text-amber-700 mt-0.5 mb-2">
                Não foi possível conectar ao Task DB.
              </p>
              {taskStatus?.available ? (
                <button
                  onClick={() => setUseFileFallback(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-900/60 hover:bg-amber-900 border border-amber-700 rounded-lg text-xs font-semibold text-amber-300 transition-colors"
                >
                  <HardDriveUpload size={12} />
                  Usar arquivo Task como contingência
                </button>
              ) : (
                <p className="text-xs text-amber-800">
                  Nenhum arquivo Task disponível para contingência.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 bg-slate-800 border border-slate-600 rounded-xl px-4 py-3.5 mb-6">
            <HardDriveUpload size={18} className="text-slate-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-slate-300">Arquivo Task (contingência)</p>
                <button
                  onClick={() => setUseFileFallback(false)}
                  className="text-slate-600 hover:text-slate-400 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              {selectedCompetencia ? (
                taskFileAvailable ? (
                  <p className="text-xs text-slate-400">{competenciaLabel(selectedCompetencia)}</p>
                ) : (
                  <p className="text-xs text-amber-600">
                    Nenhum arquivo Task para {competenciaLabel(selectedCompetencia)}.
                  </p>
                )
              ) : (
                <p className="text-xs text-slate-600">
                  Faça upload do GA para definir a competência.
                </p>
              )}
            </div>
          </div>
        )}

        {/* GA drop zone */}
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
          Arquivo GA
        </p>
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`bg-slate-800 border-2 border-dashed rounded-xl px-5 py-6 text-center cursor-pointer transition-all ${
            dragOver ? 'border-blue-500 bg-slate-700/50' : 'border-slate-600 hover:border-blue-600'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFilesPicked(e.target.files)}
          />
          <FileSpreadsheet size={24} className="mx-auto mb-2 text-slate-500" />
          <p className="text-sm font-semibold text-slate-300">Clique ou arraste o GA.xls</p>
          <p className="text-xs text-slate-500 mt-1">XLS · XLSX</p>
        </div>

        {gaFiles.length > 0 && (
          <ul className="mt-3 space-y-2">
            {gaFiles.map((f, i) => (
              <li
                key={i}
                className="flex items-center gap-3 bg-slate-800 border border-green-800/50 rounded-xl px-4 py-3"
              >
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-green-950 border border-green-800/60 shrink-0">
                  <FileSpreadsheet size={18} className="text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-100 truncate">{f.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{(f.size / 1024).toFixed(0)} KB</p>
                </div>
                <button
                  onClick={() => removeFile(i)}
                  className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/50 transition-colors"
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Competência — shown after first file confirmed, with inline edit picker */}
        {selectedCompetencia && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              Competência
            </p>
            <button
              onClick={() => {
                if (!showEditPicker)
                  setEditPickerYear(parseInt(selectedCompetencia.split('-')[0], 10))
                setShowEditPicker((v) => !v)
              }}
              className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-50 border transition-colors ${
                showEditPicker
                  ? 'bg-slate-900 border-blue-500'
                  : 'bg-slate-900 border-slate-600 hover:border-blue-500'
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
                            ? 'bg-blue-700 text-white'
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

        {error && (
          <div className="mt-4 bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">
            <strong className="block text-red-400 mb-0.5">Erro</strong>
            {error}
          </div>
        )}

        <div className="mt-5">
          <button
            onClick={() => {
              setError('')
              mutation.mutate()
            }}
            disabled={!canValidate || mutation.isPending}
            className="w-full bg-blue-700 hover:bg-blue-600 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition-colors flex items-center justify-center gap-2"
          >
            {mutation.isPending ? (
              <>
                <Spinner size="sm" /> Validando…
              </>
            ) : (
              <>
                <Upload size={15} /> Validar apontamentos
              </>
            )}
          </button>
        </div>

        {/* File add modal */}
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

              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                Competência
              </p>
              <button
                onClick={() => {
                  if (!showModalPicker) {
                    setModalPickerYear(parseInt(modalCompetencia.split('-')[0], 10))
                  }
                  setShowModalPicker((v) => !v)
                }}
                className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-50 border transition-colors mb-2 ${
                  showModalPicker
                    ? 'bg-slate-900 border-blue-500'
                    : 'bg-slate-900 border-slate-600 hover:border-blue-500'
                }`}
              >
                <span>{competenciaLabel(modalCompetencia)}</span>
                <Pencil size={12} className="text-slate-500 shrink-0 ml-2" />
              </button>

              {showModalPicker && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => setModalPickerYear((y) => y - 1)}
                      className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm font-semibold text-slate-200">{modalPickerYear}</span>
                    <button
                      onClick={() => setModalPickerYear((y) => y + 1)}
                      className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  {(() => {
                    const selParts = modalCompetencia.split('-')
                    const selYear = selParts[0] ? parseInt(selParts[0], 10) : null
                    const selMonth = selParts[1] ? parseInt(selParts[1], 10) : null
                    return (
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
                                  ? 'bg-blue-700 text-white'
                                  : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                              }`}
                            >
                              {abbr}
                            </button>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>
              )}

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
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors flex items-center gap-2"
                >
                  <Upload size={14} />
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
