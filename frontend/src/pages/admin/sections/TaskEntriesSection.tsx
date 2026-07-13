import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Table2 } from 'lucide-react'
import { OracleStatusBadge } from '../../../components/OracleStatusBadge'
import { TaskReportView } from '../../../components/TaskReportView'
import { SelectField } from '../../../components/ui/select'
import { useElementHeight } from '../../../hooks/useElementHeight'
import { billingService } from '../../../services/billing.service'
import { taskReportService } from '../../../services/task-report.service'
import { validateService } from '../../../services/validate.service'
import { monthDateRange, currentCompetencia } from '../../../lib/format'
import { downloadBlob } from '../../../lib/utils'
import type { TaskReportExportFilters } from '../../../types'

export function TaskEntriesSection() {
  const [email, setEmail] = useState('')
  const [competencia, setCompetencia] = useState(currentCompetencia())
  const { startDate, endDate } = monthDateRange(competencia)

  const { data: oracleAvailable = false } = useQuery({
    queryKey: ['oracle-status'],
    queryFn: validateService.getOracleStatus,
  })

  const { data: members = [] } = useQuery({
    queryKey: ['admin-team'],
    queryFn: billingService.listTeam,
  })

  const { data: defaultProject = null } = useQuery({
    queryKey: ['task-default-project'],
    queryFn: taskReportService.getDefaultProject,
  })

  const { data: days = [], isLoading } = useQuery({
    queryKey: ['admin-task-entries', email, startDate, endDate],
    queryFn: () => taskReportService.getEntriesFor(email, startDate, endDate),
    enabled: !!email,
  })

  const exportMutation = useMutation({
    mutationFn: (filters: TaskReportExportFilters) =>
      taskReportService.exportEntriesFor(email, startDate, endDate, filters),
    onSuccess: (blob) => downloadBlob(blob, `apontamentos_${email}_${competencia}.xlsx`),
  })

  const [headerRef, headerHeight] = useElementHeight<HTMLDivElement>()
  const contentStyle = {
    '--gabi-header-offset': `calc(var(--gabi-header-offset, 0px) + ${headerHeight}px)`,
  } as React.CSSProperties

  return (
    <section>
      <div
        ref={headerRef}
        style={{ top: 'var(--gabi-header-offset, 0px)' }}
        className="sticky z-10 bg-slate-900 pb-4 border-b border-slate-800"
      >
        <div className="flex items-center gap-2 mb-4 pt-1">
          <Table2 size={16} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Task do Time
          </h2>
          <OracleStatusBadge available={oracleAvailable} className="ml-auto" />
        </div>

        <div className="max-w-xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
            Membro do time
          </p>
          <SelectField
            value={email}
            onValueChange={setEmail}
            options={members.map((m) => ({ value: m.user_email, label: m.user_email }))}
            placeholder="Selecione um membro..."
          />
        </div>
      </div>

      <div className="pt-4" style={contentStyle}>
        {email ? (
          <TaskReportView
            competencia={competencia}
            onCompetenciaChange={setCompetencia}
            days={days}
            isLoading={isLoading}
            defaultProject={defaultProject}
            onExport={(filters) => exportMutation.mutate(filters)}
            isExporting={exportMutation.isPending}
          />
        ) : (
          <p className="text-sm text-slate-500">
            Selecione um membro do time para ver os apontamentos.
          </p>
        )}
      </div>
    </section>
  )
}
