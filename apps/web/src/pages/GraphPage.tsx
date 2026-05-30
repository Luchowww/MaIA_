import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckSquare, ChevronDown, Network } from 'lucide-react'
import { api } from '@/lib/api'
import { useGraphStore } from '@/stores/graphStore'
import CurriculumGraph from '@/components/graph/CurriculumGraph'
import BulkStatusBar from '@/components/graph/BulkStatusBar'

interface Program {
  id: string
  name: string
  is_active: boolean
}

const STATUS_DOT: Record<string, string> = {
  approved: 'bg-emerald-400',
  in_progress: 'bg-blue-400',
  pending: 'bg-slate-300',
  blocked: 'bg-amber-400',
  failed: 'bg-red-400',
  simulated: 'bg-yellow-400',
}

const STATUS_LABEL: Record<string, string> = {
  approved: 'Aprobada',
  in_progress: 'En Curso',
  pending: 'Pendiente',
  blocked: 'Bloqueada',
  failed: 'Reprobada',
  simulated: 'Simulada',
}

export default function GraphPage() {
  const [programId, setProgramId] = useState<string>('')
  const setGraph = useGraphStore((s) => s.setGraph)
  const nodes = useGraphStore((s) => s.nodes)
  const multiSelectActive = useGraphStore((s) => s.multiSelectActive)
  const setMultiSelectActive = useGraphStore((s) => s.setMultiSelectActive)

  const { data: myProgramData } = useQuery<{ programs: Program[] }>({
    queryKey: ['my-program'],
    queryFn: () => api.get('/student-courses/my-program').then((r) => r.data),
  })
  const programs = myProgramData?.programs ?? []

  // Auto-select the student's enrolled program
  useEffect(() => {
    if (programs.length > 0 && !programId) {
      setProgramId(programs[0].id)
    }
  }, [programs, programId])

  const { data, isLoading } = useQuery({
    queryKey: ['graph', programId],
    queryFn: () =>
      api.get(`/courses/graph?program_id=${programId}`).then((r) => r.data),
    enabled: !!programId,
  })

  useEffect(() => {
    if (data) setGraph(data.nodes, data.edges)
  }, [data, setGraph])

  // Count course nodes (not headers)
  const courseNodes = nodes.filter((n) => n.type === 'courseNode')

  // Status counts
  const statusCounts = courseNodes.reduce<Record<string, number>>((acc, n) => {
    const s = (n.data as { status: string }).status
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})

  const activeStatuses = Object.entries(statusCounts).filter(([, count]) => count > 0)

  const selectedProgram = programs?.find((p) => p.id === programId)

  return (
    <div className="flex flex-col h-full">
      {/* Graph toolbar */}
      <div className="flex items-center gap-4 px-5 py-3 bg-white border-b border-slate-200 flex-shrink-0">
        {/* Program selector */}
        <div className="flex items-center gap-2">
          <Network size={15} className="text-slate-400" />
          <div className="relative">
            <select
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              className="appearance-none bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-7 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Stats */}
        {courseNodes.length > 0 && (
          <span className="text-xs text-slate-400 font-medium">
            {courseNodes.length} materias
          </span>
        )}

        {/* Multi-select toggle */}
        <button
          onClick={() => setMultiSelectActive(!multiSelectActive)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all
            ${multiSelectActive
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
        >
          <CheckSquare size={13} />
          Edición múltiple
        </button>

        {/* Legend */}
        {activeStatuses.length > 0 && (
          <div className="ml-auto flex items-center gap-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Estados</span>
            {activeStatuses.map(([status, count]) => (
              <span key={status} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status] ?? 'bg-slate-300'}`} />
                <span className="text-xs text-slate-500">{STATUS_LABEL[status] ?? status}</span>
                <span className="text-[10px] font-semibold text-slate-400">({count})</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Graph area */}
      <div className="flex-1 relative">
        {!programId || isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Network size={36} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">
                {isLoading ? 'Cargando malla curricular...' : 'Selecciona un programa'}
              </p>
              {selectedProgram && isLoading && (
                <p className="text-xs text-slate-300 mt-1">{selectedProgram.name}</p>
              )}
            </div>
          </div>
        ) : (
          <CurriculumGraph />
        )}

        {/* Bulk action bar — floats above the graph */}
        <BulkStatusBar />
      </div>
    </div>
  )
}
