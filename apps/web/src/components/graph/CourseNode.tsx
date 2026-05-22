import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { CourseNodeData, CourseStatus } from '@/stores/graphStore'

const STATUS_CONFIG: Record<
  CourseStatus,
  { card: string; badge: string; dot: string; label: string; accent: string; handle: string }
> = {
  approved: {
    card: 'border-emerald-300 bg-emerald-50',
    badge: 'bg-emerald-600 text-white',
    dot: 'bg-emerald-500',
    label: 'Aprobada',
    accent: 'bg-emerald-500',
    handle: '!bg-emerald-500',
  },
  in_progress: {
    card: 'border-blue-300 bg-blue-50',
    badge: 'bg-blue-600 text-white',
    dot: 'bg-blue-500',
    label: 'En curso',
    accent: 'bg-blue-500',
    handle: '!bg-blue-500',
  },
  pending: {
    card: 'border-slate-200 bg-white',
    badge: 'bg-slate-100 text-slate-600',
    dot: 'bg-slate-300',
    label: 'Pendiente',
    accent: 'bg-slate-300',
    handle: '!bg-slate-300',
  },
  blocked: {
    card: 'border-amber-300 bg-amber-50',
    badge: 'bg-amber-500 text-white',
    dot: 'bg-amber-500',
    label: 'Bloqueada',
    accent: 'bg-amber-500',
    handle: '!bg-amber-500',
  },
  failed: {
    card: 'border-red-400 bg-red-50',
    badge: 'bg-red-600 text-white',
    dot: 'bg-red-600',
    label: 'Perdida',
    accent: 'bg-red-600',
    handle: '!bg-red-600',
  },
  simulated: {
    card: 'border-orange-400 bg-orange-50',
    badge: 'bg-orange-500 text-white',
    dot: 'bg-orange-500',
    label: 'Afectada',
    accent: 'bg-orange-500',
    handle: '!bg-orange-500',
  },
}

function CourseNode({ data, selected }: NodeProps<CourseNodeData>) {
  const cfg = STATUS_CONFIG[data.status] ?? STATUS_CONFIG.pending

  return (
    <div
      style={{ width: 190 }}
      className={`relative overflow-hidden rounded-xl border p-3 shadow-sm transition-all select-none cursor-pointer ${cfg.card} ${
        selected ? 'ring-2 ring-indigo-500 ring-offset-1 shadow-md' : 'hover:shadow-md hover:border-slate-300'
      }`}
    >
      <div className={`absolute inset-y-0 left-0 w-1 ${cfg.accent}`} />
      <Handle
        type="target"
        position={Position.Left}
        className={`!h-2.5 !w-2.5 !border-2 !border-white ${cfg.handle}`}
      />

      <div className="mb-1.5 flex items-start justify-between gap-1 pl-1">
        <span className="pt-0.5 font-mono text-[10px] font-semibold leading-none text-slate-500">
          {data.code}
        </span>
        <span className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wide ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>

      <p className="mb-2 line-clamp-2 pl-1 text-[12px] font-semibold leading-tight text-slate-950">
        {data.name}
      </p>

      <div className="flex items-center gap-1.5 pl-1">
        <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${cfg.dot}`} />
        <span className="text-[10px] font-medium text-slate-500">{data.credits} Creditos</span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className={`!h-2.5 !w-2.5 !border-2 !border-white ${cfg.handle}`}
      />
    </div>
  )
}

export default memo(CourseNode)
