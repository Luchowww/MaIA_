import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  GitCompare, Trash2, Clock, BookOpen,
  CheckCircle2, AlertCircle, FlaskConical,
} from 'lucide-react'
import { api } from '@/lib/api'

interface Scenario {
  id: string
  name: string
  program_id: string
  triggered_course_id: string
  affected_count: number
  estimated_semesters: number
  created_at: string
}

interface Props {
  onCompare: (ids: string[]) => void
}

export default function ScenariosPage({ onCompare }: Props) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: scenarios = [], isLoading } = useQuery<Scenario[]>({
    queryKey: ['scenarios'],
    queryFn: () => api.get('/simulation/scenarios').then((r) => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/simulation/scenarios/${id}`),
    onSuccess: (_data, id) => {
      setDeletingId(null)
      setSelected((prev) => { const s = new Set(prev); s.delete(id); return s })
      queryClient.invalidateQueries({ queryKey: ['scenarios'] })
    },
  })

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const s = new Set(prev)
      if (s.has(id)) {
        s.delete(id)
      } else {
        s.add(id)
      }
      return s
    })
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })

  const delayColor = (sems: number) => {
    if (sems === 0) return 'text-emerald-600 bg-emerald-50 border-emerald-200'
    if (sems <= 2) return 'text-amber-600 bg-amber-50 border-amber-200'
    return 'text-red-600 bg-red-50 border-red-200'
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Escenarios guardados</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Selecciona 2 o más escenarios para comparar cuál te gradúa antes
          </p>
        </div>
        {selected.size >= 2 && (
          <button
            onClick={() => onCompare(Array.from(selected))}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <GitCompare size={15} />
            Comparar {selected.size} escenarios
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
            Cargando escenarios...
          </div>
        ) : scenarios.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <FlaskConical size={40} className="text-slate-200 mb-3" />
            <p className="text-sm font-medium text-slate-500">No tienes escenarios guardados</p>
            <p className="text-xs text-slate-400 mt-1">
              Ve a <strong>Simulation Lab</strong>, corre una simulación y guárdala con un nombre
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {scenarios.map((s) => {
              const isSelected = selected.has(s.id)
              return (
                <div
                  key={s.id}
                  onClick={() => toggleSelect(s.id)}
                  className={`relative rounded-2xl border-2 p-5 cursor-pointer transition-all select-none ${
                    isSelected
                      ? 'border-indigo-400 bg-indigo-50 shadow-md'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  {/* Selection indicator */}
                  <div className={`absolute top-4 right-4 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'
                  }`}>
                    {isSelected && <CheckCircle2 size={12} className="text-white" />}
                  </div>

                  {/* Scenario name */}
                  <div className="flex items-start gap-2 mb-3 pr-6">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FlaskConical size={15} className="text-slate-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 leading-snug">{s.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{formatDate(s.created_at)}</p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex gap-2 mb-4">
                    <div className={`flex-1 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${delayColor(s.estimated_semesters)}`}>
                      <Clock size={11} />
                      +{s.estimated_semesters} sem
                    </div>
                    <div className="flex-1 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                      <BookOpen size={11} />
                      {s.affected_count} materias
                    </div>
                  </div>

                  {/* Risk label */}
                  <div className={`flex items-center gap-1.5 text-[10px] font-medium ${
                    s.estimated_semesters === 0
                      ? 'text-emerald-600'
                      : s.estimated_semesters <= 2
                      ? 'text-amber-600'
                      : 'text-red-600'
                  }`}>
                    <AlertCircle size={10} />
                    {s.estimated_semesters === 0
                      ? 'Sin retraso estimado'
                      : s.estimated_semesters <= 2
                      ? 'Retraso moderado'
                      : 'Retraso alto'}
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeletingId(s.id)
                    }}
                    className="absolute bottom-4 right-4 p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
            <p className="text-sm font-semibold text-slate-900 mb-1">¿Eliminar escenario?</p>
            <p className="text-xs text-slate-500 mb-5">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate(deletingId)}
                disabled={deleteMutation.isPending}
                className="flex-1 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
