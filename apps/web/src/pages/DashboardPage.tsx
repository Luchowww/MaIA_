import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import GraphPage from './GraphPage'

interface Program {
  id: string
  name: string
  is_active: boolean
}

export default function DashboardPage() {
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null)

  const { data: programs, isLoading } = useQuery<Program[]>({
    queryKey: ['programs'],
    queryFn: () => api.get('/admin/programs').then((r) => r.data),
  })

  if (selectedProgram) {
    return <GraphPage program={selectedProgram} onBack={() => setSelectedProgram(null)} />
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Selecciona tu programa</h1>
        <p className="text-sm text-gray-500 mb-6">Elige el programa académico para ver tu malla curricular.</p>

        {isLoading && <p className="text-sm text-gray-400">Cargando programas...</p>}

        <div className="grid gap-3">
          {programs?.filter((p) => p.is_active).map((program) => (
            <button
              key={program.id}
              onClick={() => setSelectedProgram(program)}
              className="text-left bg-white border border-gray-200 hover:border-violet-400 hover:shadow-sm rounded-xl p-5 transition"
            >
              <p className="font-medium text-gray-900">{program.name}</p>
            </button>
          ))}
        </div>

        {programs?.length === 0 && (
          <p className="text-sm text-gray-400">No hay programas disponibles aún.</p>
        )}
      </div>
    </div>
  )
}
