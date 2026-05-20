import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useGraphStore, type CourseNodeData, type CourseStatus } from '@/stores/graphStore'

const STATUSES: { value: CourseStatus; label: string }[] = [
  { value: 'approved', label: 'Aprobada' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'failed', label: 'Reprobada' },
  { value: 'blocked', label: 'Bloqueada' },
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
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl p-6 w-80"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-gray-900 mb-0.5">{data.code} — {data.name}</h3>
        <p className="text-xs text-gray-500 mb-4">{data.credits} créditos · Semestre {data.semester}</p>

        <label className="text-xs font-medium text-gray-600 block mb-1">Estado</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as CourseStatus)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 mb-4"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {mutation.error && (
          <p className="text-xs text-red-500 mb-3">
            {(mutation.error as Error).message}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate(status)}
            disabled={mutation.isPending}
            className="flex-1 bg-violet-600 hover:bg-violet-700 text-white rounded-lg py-2 text-sm font-medium transition disabled:opacity-50"
          >
            {mutation.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
