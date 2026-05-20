import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { CourseNodeData, CourseStatus } from '@/stores/graphStore'

const STATUS_STYLES: Record<CourseStatus, string> = {
  approved: 'bg-emerald-100 border-emerald-400 text-emerald-800',
  in_progress: 'bg-blue-100 border-blue-400 text-blue-800',
  pending: 'bg-gray-100 border-gray-300 text-gray-600',
  blocked: 'bg-red-100 border-red-400 text-red-700',
  failed: 'bg-orange-100 border-orange-400 text-orange-700',
  simulated: 'bg-amber-100 border-amber-400 text-amber-700',
}

const STATUS_LABEL: Record<CourseStatus, string> = {
  approved: 'Aprobada',
  in_progress: 'En curso',
  pending: 'Pendiente',
  blocked: 'Bloqueada',
  failed: 'Reprobada',
  simulated: 'Simulada',
}

function CourseNode({ data, selected }: NodeProps<CourseNodeData>) {
  const style = STATUS_STYLES[data.status]

  return (
    <div
      className={`border-2 rounded-xl px-3 py-2 min-w-[140px] max-w-[160px] cursor-pointer transition shadow-sm ${style} ${selected ? 'ring-2 ring-violet-500 ring-offset-1' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-400" />
      <p className="text-[11px] font-mono font-semibold mb-0.5">{data.code}</p>
      <p className="text-xs font-medium leading-tight line-clamp-2">{data.name}</p>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] opacity-70">{data.credits} cr · Sem {data.semester}</span>
        <span className="text-[9px] font-semibold uppercase tracking-wide opacity-80">
          {STATUS_LABEL[data.status]}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-gray-400" />
    </div>
  )
}

export default memo(CourseNode)
