import { useCallback, useState, memo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  type NodeMouseHandler,
  type NodeProps,
  BackgroundVariant,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useGraphStore, type CourseNodeData } from '@/stores/graphStore'
import CourseNode from './CourseNode'
import CourseDetailModal from './CourseDetailModal'

// Semester header node — just a label, non-interactive
const SemesterHeaderNode = memo(({ data }: NodeProps<{ label: string }>) => (
  <div
    style={{ width: 190 }}
    className="text-center"
  >
    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
      {data.label}
    </span>
  </div>
))
SemesterHeaderNode.displayName = 'SemesterHeaderNode'

const nodeTypes = {
  courseNode: CourseNode,
  semesterHeader: SemesterHeaderNode,
}

const defaultEdgeOptions = {
  type: 'smoothstep',
  style: { stroke: '#CBD5E1', strokeWidth: 2 },
  animated: false,
}

export default function CurriculumGraph() {
  const { nodes, edges, simulationMode, setSelectedCourse } = useGraphStore()
  const [selected, setSelected] = useState<{ id: string; data: CourseNodeData } | null>(null)

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (node.type === 'semesterHeader') return
      if (simulationMode) {
        setSelectedCourse(node.id)
      } else {
        setSelected({ id: node.id, data: node.data as CourseNodeData })
      }
    },
    [simulationMode, setSelectedCourse],
  )

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.15, minZoom: 0.4, maxZoom: 1.2 }}
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#CBD5E1"
        />
        <Controls showInteractive={false} />
      </ReactFlow>

      {selected && (
        <CourseDetailModal
          courseId={selected.id}
          data={selected.data}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
