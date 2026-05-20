import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useGraphStore } from '@/stores/graphStore'
import CurriculumGraph from '@/components/graph/CurriculumGraph'
import SimulationPanel from '@/components/graph/SimulationPanel'

interface Props {
  program: { id: string; name: string }
  onBack: () => void
}

export default function GraphPage({ program, onBack }: Props) {
  const setGraph = useGraphStore((s) => s.setGraph)

  const { data, isLoading } = useQuery({
    queryKey: ['graph', program.id],
    queryFn: () =>
      api.get(`/courses/graph?program_id=${program.id}`).then((r) => r.data),
  })

  useEffect(() => {
    if (data) setGraph(data.nodes, data.edges)
  }, [data, setGraph])

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="flex items-center gap-4 px-6 py-3 bg-white border-b border-gray-200">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-800 transition">
          ← Programas
        </button>
        <h2 className="font-semibold text-gray-900">{program.name}</h2>
        <SimulationPanel programId={program.id} />
      </header>

      <main className="flex-1 relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">
            Cargando malla curricular...
          </div>
        ) : (
          <CurriculumGraph />
        )}
      </main>
    </div>
  )
}
