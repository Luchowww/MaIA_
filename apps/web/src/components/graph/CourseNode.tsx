import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { CourseNodeData, CourseStatus } from '@/stores/graphStore'

const STATUS_CONFIG: Record<
  CourseStatus,
  { card: string; badge: string; dot: string; label: string }
> = {
  approved: {
    card: 'border-emerald-200 bg-white',
    badge: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-400',
    label: 'Aprobada',
  },
  in_progress: {
    card: 'border-blue-200 bg-white',
    badge: 'bg-blue-100 text-blue-700',
    dot: 'bg-blue-400',
    label: 'En Curso',
  },
  pending: {
    card: 'border-slate-200 bg-white',
    badge: 'bg-slate-100 text-slate-500',
    dot: 'bg-slate-300',
    label: 'Pendiente',
  },
  blocked: {
    card: 'border-amber-200 bg-white',
    badge: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-400',
    label: 'Bloqueada',
  },
  failed: {
    card: 'border-red-200 bg-white',
    badge: 'bg-red-100 text-red-600',
    dot: 'bg-red-400',
    label: 'Reprobada',
  },
  simulated: {
    card: 'border-yellow-300 bg-yellow-50',
    badge: 'bg-yellow-100 text-yellow-700',
    dot: 'bg-yellow-400',
    label: 'Simulada',
  },
}

function CourseNode({ data, selected }: NodeProps<CourseNodeData>) {
  const cfg = STATUS_CONFIG[data.status] ?? STATUS_CONFIG.pending

  return (
    <div
      style={{ width: 190 }}
      className={`border rounded-xl p-3 cursor-pointer shadow-sm transition-all select-none ${cfg.card} ${
        selected ? 'ring-2 ring-indigo-500 ring-offset-1 shadow-md' : 'hover:shadow-md hover:border-slate-300'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-slate-300 !border-2 !border-white"
      />

      {/* Top row: code + badge */}
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <span className="text-[10px] font-mono font-semibold text-slate-400 leading-none pt-0.5">
          {data.code}
        </span>
        <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full leading-none flex-shrink-0 ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>

      {/* Course name */}
      <p className="text-[12px] font-semibold text-slate-900 leading-tight line-clamp-2 mb-2">
        {data.name}
      </p>

      {/* Bottom: credits */}
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
        <span className="text-[10px] text-slate-400">{data.credits} Créditos</span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-slate-300 !border-2 !border-white"
      />
    </div>
  )
}

export default memo(CourseNode)
