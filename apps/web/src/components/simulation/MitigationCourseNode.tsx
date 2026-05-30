import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'

export interface MitigationCourseNodeData {
  course_id: string
  code: string
  name: string
  credits: number
  original_semester: number
  moved_from: number | null        // adelantada: placed in earlier semester
  delayed_from: number | null      // retrasada: placed in later semester
  is_retaken: boolean              // the lost course being retaken
  hasViolation?: boolean
}

function MitigationCourseNode({ data }: NodeProps<MitigationCourseNodeData>) {
  const { code, name, credits, moved_from, delayed_from, is_retaken, hasViolation } = data

  const borderCls = hasViolation
    ? 'border-red-500 shadow-red-200 shadow-md'
    : is_retaken
    ? 'border-red-300'
    : moved_from !== null
    ? 'border-indigo-300'
    : delayed_from !== null
    ? 'border-orange-300'
    : 'border-slate-200'

  const bgCls = is_retaken
    ? 'bg-red-50'
    : moved_from !== null
    ? 'bg-indigo-50'
    : delayed_from !== null
    ? 'bg-orange-50'
    : 'bg-white'

  const badgeCls = is_retaken
    ? 'bg-red-100 text-red-700'
    : moved_from !== null
    ? 'bg-indigo-100 text-indigo-700'
    : delayed_from !== null
    ? 'bg-orange-100 text-orange-700'
    : null

  const badgeLabel = is_retaken
    ? 'en repetición'
    : moved_from !== null
    ? `← de sem ${moved_from}`
    : delayed_from !== null
    ? `↑ de sem ${delayed_from}`
    : null

  return (
    <div
      style={{ width: 210 }}
      className={`border-2 rounded-xl p-2.5 shadow-sm select-none ${borderCls} ${bgCls}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-slate-300 !border-2 !border-white"
      />

      {/* Code + credits row */}
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="text-[10px] font-mono font-bold text-slate-500 leading-none">{code}</span>
        <span className="text-[10px] text-slate-400 flex-shrink-0">{credits}cr</span>
      </div>

      {/* Full name */}
      <p className="text-[11px] font-semibold text-slate-900 leading-tight line-clamp-2">{name}</p>

      {/* Status badge */}
      {badgeLabel && (
        <span className={`inline-block mt-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${badgeCls}`}>
          {badgeLabel}
        </span>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-slate-300 !border-2 !border-white"
      />
    </div>
  )
}

export default memo(MitigationCourseNode)
