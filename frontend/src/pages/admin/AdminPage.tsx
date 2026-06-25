import { useState, useRef, FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Trash2,
  Upload,
  FileSpreadsheet,
  Users,
  Shield,
  ChevronLeft,
  ChevronRight,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Check,
  X,
} from 'lucide-react'
import { Layout } from '../../components/Layout'
import { Spinner } from '../../components/Spinner'
import { adminService } from '../../services/admin.service'
import { competenciaLabel, fmtDatetime } from '../../lib/format'
import { EquipeSection } from './sections/EquipeSection'
import { AprovacoesSection } from './sections/AprovacoesSection'
import { ConfiguracoesSection } from './sections/ConfiguracoesSection'
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

function normalize(s: string) {
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
  const name = normalize(filename)

  // (?<!\d) / (?!\d) instead of \b — \b treats underscore as word char, breaking _2026_03_ patterns
  const yearMatch = name.match(/(?<!\d)(20[2-9]\d)(?!\d)/)
  const year = yearMatch?.[1] ?? prevYear

  for (const [ptName, num] of Object.entries(MONTHS_PT)) {
    if (name.includes(normalize(ptName))) return `${year}-${num}`
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

function TaskSection() {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [modalCompetencia, setModalCompetencia] = useState('')
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear())
  const [showPicker, setShowPicker] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['admin-tasks'],
    queryFn: adminService.listTasks,
  })

  const uploadMutation = useMutation({
    mutationFn: ({ file, comp }: { file: File; comp: string }) =>
      adminService.uploadTask(file, comp),
    onSuccess: () => {
      setUploadMsg('Upload realizado com sucesso.')
      setPendingFile(null)
      qc.invalidateQueries({ queryKey: ['admin-tasks'] })
      qc.invalidateQueries({ queryKey: ['task-status'] })
      qc.invalidateQueries({ queryKey: ['competencias'] })
    },
    onError: (err: unknown) => {
      setPendingFile(null)
      if (axios.isAxiosError(err)) {
        setUploadMsg(`Erro: ${err.response?.data?.detail ?? err.message}`)
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminService.deleteTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tasks'] }),
  })

  function handleFileSelect(file: File) {
    const comp = parseCompetencia(file.name)
    setPendingFile(file)
    setModalCompetencia(comp)
    setPickerYear(parseInt(comp.split('-')[0], 10))
    setShowPicker(false)
    setUploadMsg('')
    setShowModal(true)
  }

  function handleModalConfirm() {
    if (!pendingFile) return
    setShowModal(false)
    uploadMutation.mutate({ file: pendingFile, comp: modalCompetencia })
  }

  function handleModalCancel() {
    setShowModal(false)
    setPendingFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <FileSpreadsheet size={16} className="text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
          Relatório Task
        </h2>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) handleFileSelect(file)
        }}
        className={`bg-slate-800 border-2 border-dashed rounded-xl px-5 py-5 text-center cursor-pointer transition-colors ${
          isDragging ? 'border-blue-500 bg-slate-700' : 'border-slate-600 hover:border-blue-600'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFileSelect(file)
          }}
        />
        {uploadMutation.isPending ? (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
            <Spinner size="sm" />
            <span>Enviando...</span>
          </div>
        ) : (
          <>
            <Upload size={20} className="mx-auto mb-2 text-slate-500" />
            <p className="text-sm font-semibold text-slate-300">Task.xlsx</p>
            <p className="text-xs text-slate-500 mt-1">Clique ou arraste para selecionar</p>
          </>
        )}
      </div>

      {uploadMsg && (
        <p
          className={`mt-2 text-xs ${uploadMsg.startsWith('Erro') ? 'text-red-400' : 'text-green-400'}`}
        >
          {uploadMsg}
        </p>
      )}

      {showModal && pendingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={handleModalCancel} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-200 mb-1">Confirmar competência</h3>
            <p className="text-xs text-slate-500 mb-4 truncate">{pendingFile.name}</p>

            {/* Competência — label clicável, picker expande abaixo */}
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              Competência
            </p>
            <button
              onClick={() => setShowPicker((v) => !v)}
              className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-50 border transition-colors mb-2 ${
                showPicker
                  ? 'bg-slate-900 border-blue-500'
                  : 'bg-slate-900 border-slate-600 hover:border-blue-500'
              }`}
            >
              <span>{competenciaLabel(modalCompetencia)}</span>
              <Pencil size={12} className="text-slate-500 shrink-0 ml-2" />
            </button>

            {showPicker && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => setPickerYear((y) => y - 1)}
                    className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-semibold text-slate-200">{pickerYear}</span>
                  <button
                    onClick={() => setPickerYear((y) => y + 1)}
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
                        const isSelected = selYear === pickerYear && selMonth === monthNum
                        return (
                          <button
                            key={abbr}
                            onClick={() => {
                              setModalCompetencia(
                                `${pickerYear}-${String(monthNum).padStart(2, '0')}`
                              )
                              setShowPicker(false)
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
                Confirmar e enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {!isLoading && tasks.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Histórico
          </p>
          <div className="space-y-2">
            {tasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-300">
                    {competenciaLabel(t.competencia)}
                  </span>
                  <span className="text-slate-500 ml-2">{t.filename}</span>
                  <p className="text-slate-600 mt-0.5">
                    {fmtDatetime(t.uploaded_at)} · {t.uploaded_by}
                  </p>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(t.id)}
                  disabled={deleteMutation.isPending}
                  className="text-slate-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function UsersSection() {
  const qc = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [formError, setFormError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: adminService.listUsers,
  })

  const createMutation = useMutation({
    mutationFn: () => adminService.createUser(username + '@db1.com.br', password, isAdmin),
    onSuccess: () => {
      setUsername('')
      setPassword('')
      setIsAdmin(false)
      setFormError('')
      qc.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (err: unknown) => {
      if (axios.isAxiosError(err)) {
        setFormError(err.response?.data?.detail ?? 'Erro ao criar usuário.')
      }
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (id: number) => adminService.toggleUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminService.deleteUser(id),
    onSuccess: () => {
      setConfirmDeleteId(null)
      qc.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    createMutation.mutate()
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Users size={16} className="text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Usuários</h2>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-5"
      >
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">
          Novo usuário
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              E-mail
            </label>
            <div className="flex items-center bg-slate-900 border border-slate-600 rounded-lg focus-within:border-blue-500 transition-colors overflow-hidden">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="pedro.santos"
                autoComplete="username"
                required
                className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm text-slate-50 placeholder-slate-600 outline-none"
              />
              <span className="px-3 py-2 text-sm text-slate-400 bg-slate-800/80 border-l border-slate-600 select-none whitespace-nowrap font-medium">
                @db1.com.br
              </span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="mínimo 6 caracteres"
              required
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-50 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 mb-4 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
            className="accent-blue-500"
          />
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Shield size={12} /> Administrador
          </span>
        </label>
        {formError && <p className="text-xs text-red-400 mb-3">{formError}</p>}
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors flex items-center gap-2"
        >
          {createMutation.isPending ? <Spinner size="sm" /> : <Plus size={14} />}
          Criar usuário
        </button>
      </form>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className={`flex items-center justify-between border rounded-lg px-4 py-3 text-xs ${
                u.is_active
                  ? 'bg-slate-900 border-slate-700'
                  : 'bg-slate-950 border-slate-800 opacity-50'
              }`}
            >
              <div>
                <span className="text-slate-300 font-medium">{u.email}</span>
                {!!u.is_admin && (
                  <span className="ml-2 bg-blue-950 text-blue-300 border border-blue-800 text-[0.6rem] font-bold px-1.5 py-0.5 rounded uppercase">
                    Admin
                  </span>
                )}
                {!u.is_active && <span className="ml-2 text-slate-600">· inativo</span>}
                <p className="text-slate-600 mt-0.5">{fmtDatetime(u.created_at)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <button
                  onClick={() => toggleMutation.mutate(u.id)}
                  disabled={toggleMutation.isPending || deleteMutation.isPending}
                  title={u.is_active ? 'Desativar usuário' : 'Ativar usuário'}
                  className="transition-colors"
                >
                  {u.is_active ? (
                    <ToggleRight size={20} className="text-green-500 hover:text-green-400" />
                  ) : (
                    <ToggleLeft size={20} className="text-slate-600 hover:text-slate-400" />
                  )}
                </button>

                {confirmDeleteId === u.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-500">Excluir?</span>
                    <button
                      onClick={() => deleteMutation.mutate(u.id)}
                      disabled={deleteMutation.isPending}
                      title="Confirmar exclusão"
                      className="text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      title="Cancelar"
                      className="text-slate-600 hover:text-slate-400 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(u.id)}
                    disabled={deleteMutation.isPending || toggleMutation.isPending}
                    title="Excluir usuário"
                    className="text-slate-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function AdminPage() {
  const { section } = useParams<{ section: string }>()

  const content = (() => {
    switch (section) {
      case 'users':
        return <UsersSection />
      case 'team':
        return <EquipeSection />
      case 'approvals':
        return <AprovacoesSection />
      case 'settings':
        return <ConfiguracoesSection />
      default:
        return <TaskSection />
    }
  })()

  return (
    <Layout>
      <div className="max-w-2xl px-6 py-7">{content}</div>
    </Layout>
  )
}
