import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, CheckSquare } from 'lucide-react'
import { useGraphStore, type CourseStatus } from '@/stores/graphStore'
import api from '@/lib/api'

const STATUS_OPTIONS: { status: CourseStatus; label: string; cls: string }[] = [
  { status: 'approved',    label: 'Aprobada',   cls: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200' },
  { status: 'in_progress', label: 'En Curso',   cls: 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200' },
  { status: 'pending',     label: 'Pendiente',  cls: 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200' },
  { status: 'failed',      label: 'Reprobada',  cls: 'bg-red-100 text-red-700 hover:bg-red-200 border-red-200' },
  { status: 'blocked',     label: 'Bloqueada',  cls: 'bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200' },
]

export default function BulkStatusBar() {
  const { multiSelectActive, multiSelectedIds, setMultiSelectActive, clearMultiSelect, bulkUpdateNodeStatus } = useGraphStore()
  const queryClient = useQueryClient()
  const [pickedStatus, setPickedStatus] = useState<CourseStatus | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const count = multiSelectedIds.size

  const bulkMutation = useMutation({
    mutationFn: (updates: { course_id: string; status: CourseStatus }[]) =>
      api.patch('/student-courses/bulk', { updates }).then((r) => r.data),
    onSuccess: (data, variables) => {
      const ids = variables.map((u) => u.course_id)
      const status = variables[0].status
      bulkUpdateNodeStatus(ids, status)
      queryClient.invalidateQueries({ queryKey: ['graph'] })
      const failCount = data.failed?.length ?? 0
      const okCount = data.succeeded?.length ?? 0
      setFeedback(
        failCount > 0
          ? `${okCount} actualizadas · ${failCount} fallaron`
          : `${okCount} actualizadas`,
      )
      setPickedStatus(null)
      clearMultiSelect()
      setTimeout(() => setFeedback(null), 3000)
    },
  })

  if (!multiSelectActive) return null

  const handleApply = () => {
    if (!pickedStatus || count === 0) return
    const updates = [...multiSelectedIds].map((id) => ({ course_id: id, status: pickedStatus }))
    bulkMutation.mutate(updates)
  }

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl px-5 py-3.5 flex items-center gap-4 min-w-[520px]">

        {/* Count */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <CheckSquare size={15} className="text-indigo-600" />
          <span className="text-sm font-semibold text-slate-800">
            {count > 0 ? `${count} seleccionada${count > 1 ? 's' : ''}` : 'Ninguna seleccionada'}
          </span>
        </div>

        <div className="w-px h-6 bg-slate-200 flex-shrink-0" />

        {/* Status buttons */}
        <div className="flex gap-1.5 flex-1">
          {STATUS_OPTIONS.map(({ status, label, cls }) => (
            <button
              key={status}
              onClick={() => setPickedStatus(status === pickedStatus ? null : status)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all
                ${pickedStatus === status ? `${cls} ring-2 ring-offset-1 ring-current` : cls}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Apply */}
        <button
          onClick={handleApply}
          disabled={!pickedStatus || count === 0 || bulkMutation.isPending}
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-colors flex-shrink-0"
        >
          {bulkMutation.isPending ? 'Aplicando...' : 'Aplicar'}
        </button>

        {/* Feedback */}
        {feedback && (
          <span className="text-[11px] text-emerald-600 font-semibold flex-shrink-0">{feedback}</span>
        )}

        {/* Close */}
        <button
          onClick={() => { setMultiSelectActive(false); setPickedStatus(null); setFeedback(null) }}
          className="text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
