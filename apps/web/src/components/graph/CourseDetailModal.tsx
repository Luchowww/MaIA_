import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, BookOpen, Clock, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import { useGraphStore, type CourseNodeData, type CourseStatus } from '@/stores/graphStore'

const STATUSES: { value: CourseStatus; label: string; cls: string }[] = [
  { value: 'approved', label: 'Aprobada', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200' },
  { value: 'in_progress', label: 'En Curso', cls: 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200' },
  { value: 'pending', label: 'Pendiente', cls: 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200' },
  { value: 'failed', label: 'Reprobada', cls: 'bg-red-100 text-red-600 border-red-200 hover:bg-red-200' },
  { value: 'blocked', label: 'Bloqueada', cls: 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200' },
]

interface Props {
  courseId: string
  data: CourseNodeData
  onClose: () => void
}

export default function CourseDetailModal({ courseId, data, onClose }: Props) {
  const [status, setStatus] = useState<CourseStatus>(data.status)
  const updateNodeStatus = useGraphStore((s) => s.updateNodeStatus)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (newStatus: CourseStatus) =>
      api.patch(`/student-courses/${courseId}`, { status: newStatus }).then((r) => r.data),
    onSuccess: (_, newStatus) => {
      updateNodeStatus(courseId, newStatus)
      queryClient.invalidateQueries({ queryKey: ['graph'] })
      onClose()
    },
  })

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div className="fixed top-0 right-0 h-full w-[380px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div>
            <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
              {data.code}
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-2 leading-tight">{data.name}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 p-5 border-b border-slate-100">
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <BookOpen size={12} className="text-slate-400" />
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Créditos</span>
              </div>
              <p className="text-xl font-bold text-slate-900">{data.credits} <span className="text-xs font-normal text-slate-400">AC</span></p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock size={12} className="text-slate-400" />
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Semestre</span>
              </div>
              <p className="text-xl font-bold text-slate-900">{data.semester}</p>
            </div>
          </div>

          {/* Status selector */}
          <div className="p-5 border-b border-slate-100">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-3">
              Selector de Estado
            </label>
            <div className="grid grid-cols-2 gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  className={`border rounded-xl px-3 py-2 text-xs font-semibold text-left transition-all ${s.cls} ${
                    status === s.value ? 'ring-2 ring-offset-1 ring-indigo-400' : ''
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content preview placeholder */}
          <div className="p-5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-3">
              Resumen del Contenido
            </label>
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 text-white">
              <p className="text-xs font-medium opacity-70">Unidad 1</p>
              <p className="text-sm font-semibold mt-1">{data.name}</p>
              <p className="text-xs opacity-50 mt-1">Semestre {data.semester}</p>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-100 flex flex-col gap-2">
          {mutation.error && (
            <p className="text-xs text-red-500 text-center">
              {(mutation.error as Error).message}
            </p>
          )}
          <button
            onClick={() => mutation.mutate(status)}
            disabled={mutation.isPending || status === data.status}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {mutation.isPending ? 'Guardando...' : 'Registrar Calificación'}
            {!mutation.isPending && <ChevronRight size={15} />}
          </button>
          <button
            onClick={onClose}
            className="w-full text-slate-500 hover:text-slate-700 text-sm font-medium py-2 rounded-xl hover:bg-slate-50 transition-colors"
          >
            Ver Programa Extendido
          </button>
        </div>
      </div>
    </>
  )
}
