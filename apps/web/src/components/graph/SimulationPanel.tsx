import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useGraphStore } from '@/stores/graphStore'

interface Props {
  programId: string
}

export default function SimulationPanel({ programId }: Props) {
  const { simulationMode, selectedCourseId, setSimulationMode, applySimulationResult, nodes } =
    useGraphStore()

  const [affectedCount, setAffectedCount] = useState<number | null>(null)

  const mutation = useMutation({
    mutationFn: (courseId: string) =>
      api
        .post('/simulation/loss', { course_id: courseId, program_id: programId })
        .then((r) => r.data),
    onSuccess: (data) => {
      applySimulationResult(data.affected_course_ids)
      setAffectedCount(data.affected_course_ids.length)
      setSimulationMode(false)
    },
  })

  const selectedNode = nodes.find((n) => n.id === selectedCourseId)

  if (!simulationMode) {
    return (
      <div className="ml-auto flex items-center gap-3">
        {affectedCount !== null && (
          <span className="text-xs text-amber-600 font-medium">
            {affectedCount} materia(s) afectadas por la simulación
          </span>
        )}
        <button
          onClick={() => {
            setSimulationMode(true)
            setAffectedCount(null)
          }}
          className="text-sm bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 rounded-lg px-3 py-1.5 transition"
        >
          Simular pérdida
        </button>
      </div>
    )
  }

  return (
    <div className="ml-auto flex items-center gap-3">
      <p className="text-sm text-amber-700 font-medium">
        {selectedCourseId
          ? `Seleccionada: ${selectedNode?.data.code ?? selectedCourseId}`
          : 'Haz click en una materia para simular su pérdida'}
      </p>
      {selectedCourseId && (
        <button
          onClick={() => mutation.mutate(selectedCourseId)}
          disabled={mutation.isPending}
          className="text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg px-3 py-1.5 transition disabled:opacity-50"
        >
          {mutation.isPending ? 'Calculando...' : 'Confirmar simulación'}
        </button>
      )}
      <button
        onClick={() => setSimulationMode(false)}
        className="text-sm text-gray-500 hover:text-gray-700 transition"
      >
        Cancelar
      </button>
    </div>
  )
}
