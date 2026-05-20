import { useCallback, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type NodeMouseHandler,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useGraphStore, type CourseNodeData } from '@/stores/graphStore'
import CourseNode from './CourseNode'
import CourseDetailModal from './CourseDetailModal'

const nodeTypes = { courseNode: CourseNode }

export default function CurriculumGraph() {
  const { nodes, edges } = useGraphStore()
  const [selected, setSelected] = useState<{ id: string; data: CourseNodeData } | null>(null)

  const { simulationMode, setSelectedCourse } = useGraphStore()

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
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
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const status = (n.data as CourseNodeData).status
            const colors: Record<string, string> = {
              approved: '#6ee7b7',
              in_progress: '#93c5fd',
              pending: '#d1d5db',
              blocked: '#fca5a5',
              failed: '#fdba74',
              simulated: '#fcd34d',
            }
            return colors[status] ?? '#d1d5db'
          }}
        />
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
