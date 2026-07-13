import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Layout } from '../../components/Layout'
import { OracleStatusBadge } from '../../components/OracleStatusBadge'
import { TaskReportView } from '../../components/TaskReportView'
import { taskReportService } from '../../services/task-report.service'
import { validateService } from '../../services/validate.service'
import { monthDateRange, currentCompetencia } from '../../lib/format'
import { downloadBlob } from '../../lib/utils'
import type { TaskReportExportFilters } from '../../types'

export function TaskReportPage() {
  const [competencia, setCompetencia] = useState(currentCompetencia())
  const { startDate, endDate } = monthDateRange(competencia)

  const { data: oracleAvailable = false } = useQuery({
    queryKey: ['oracle-status'],
    queryFn: validateService.getOracleStatus,
  })

  const { data: defaultProject = null } = useQuery({
    queryKey: ['task-default-project'],
    queryFn: taskReportService.getDefaultProject,
  })

  const { data: days = [], isLoading } = useQuery({
    queryKey: ['my-task-entries', startDate, endDate],
    queryFn: () => taskReportService.getMyEntries(startDate, endDate),
  })

  const exportMutation = useMutation({
    mutationFn: (filters: TaskReportExportFilters) =>
      taskReportService.exportMyEntries(startDate, endDate, filters),
    onSuccess: (blob) => downloadBlob(blob, `apontamentos_${competencia}.xlsx`),
  })

  return (
    <Layout
      title="Meu Task"
      subtitle="Horas lançadas no Task, para lançar no GA"
      actions={<OracleStatusBadge available={oracleAvailable} />}
    >
      <div className="px-6 py-7">
        <TaskReportView
          competencia={competencia}
          onCompetenciaChange={setCompetencia}
          days={days}
          isLoading={isLoading}
          defaultProject={defaultProject}
          onExport={(filters) => exportMutation.mutate(filters)}
          isExporting={exportMutation.isPending}
        />
      </div>
    </Layout>
  )
}
