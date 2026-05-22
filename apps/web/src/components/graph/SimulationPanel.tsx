import { AlertTriangle, MousePointer2, RotateCcw, X } from 'lucide-react'
import { useGraphStore } from '@/stores/graphStore'

export default function SimulationPanel() {
  const {
    nodes,
    simulationMode,
    selectedCourseId,
    simulationResult,
    setSimulationMode,
    setSelectedCourse,
    runLossSimulation,
    resetSimulation,
  } = useGraphStore()

  const selectedNode = nodes.find((node) => node.id === selectedCourseId)
  const failedNode = nodes.find((node) => node.id === simulationResult?.failedId)
  const affectedDependents = simulationResult
    ? Math.max(simulationResult.affectedIds.length - 1, 0)
    : 0

  if (simulationMode) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5">
        <MousePointer2 size={14} className="text-amber-600" />
        <span className="text-xs font-medium text-amber-800">
          {selectedCourseId
            ? `Seleccionada: ${selectedNode?.data.code ?? selectedCourseId}`
            : 'Haz clic en una materia'}
        </span>
        <button
          type="button"
          onClick={() => selectedCourseId && runLossSimulation(selectedCourseId)}
          disabled={!selectedCourseId}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <AlertTriangle size={13} />
          Ver impacto
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedCourse(null)
            setSimulationMode(false)
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-white hover:text-slate-700"
          title="Cancelar"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {simulationResult && (
        <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
          {failedNode?.data.code ?? 'Materia'} perdida, {affectedDependents} afectadas
        </span>
      )}
      {simulationResult && (
        <button
          type="button"
          onClick={resetSimulation}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
          title="Limpiar simulacion"
        >
          <RotateCcw size={15} />
        </button>
      )}
      <button
        type="button"
        onClick={() => setSimulationMode(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-600"
      >
        <AlertTriangle size={15} />
        Simular perdida
      </button>
    </div>
  )
}
