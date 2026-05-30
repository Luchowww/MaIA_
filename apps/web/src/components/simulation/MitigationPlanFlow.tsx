import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
  type NodeDragHandler,
  useEdgesState,
  useNodesState,
} from 'reactflow'
import 'reactflow/dist/style.css'
import MitigationCourseNode, { type MitigationCourseNodeData } from './MitigationCourseNode'

// ── Exported types (re-used in SimulationPage) ────────────────────────────────

export interface MitigationCourse {
  course_id: string
  code: string
  name: string
  credits: number
  original_semester: number
  moved_from: number | null
  delayed_from: number | null
  is_retaken: boolean
}

export interface MitigationSemester {
  semester: number
  courses: MitigationCourse[]
  credits_used: number
  extra_credits: number
  extra_cost: number
}

export interface Prerequisite {
  source: string
  target: string
}

export interface Violation {
  type: string
  course_id?: string
  course_name?: string
  semester?: number
  detail: string
}

// ── Layout constants ──────────────────────────────────────────────────────────

const CARD_W = 210
const COL_GAP = 72
const CARD_H = 106
const ROW_GAP = 12
const HEADER_H = 50

// ── Semester header node ──────────────────────────────────────────────────────

const SemesterHeaderNode = memo(
  ({ data }: { data: { label: string; creditsUsed: number; extraCost: number } }) => (
    <div style={{ width: CARD_W }} className="text-center select-none pointer-events-none">
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{data.label}</p>
      <p
        className={`text-[10px] mt-0.5 ${
          data.creditsUsed > 17 ? 'text-amber-600 font-semibold' : 'text-slate-400'
        }`}
      >
        {data.creditsUsed}cr
        {data.extraCost > 0 && (
          <span className="text-amber-500"> · ${(data.extraCost / 1_000).toFixed(0)}k</span>
        )}
      </p>
    </div>
  ),
)
SemesterHeaderNode.displayName = 'SemesterHeaderNode'

const nodeTypes = {
  mitigationNode: MitigationCourseNode,
  semesterHeader: SemesterHeaderNode,
}

// ── Layout builder ────────────────────────────────────────────────────────────

interface SemesterCol { semester: number; x: number }

function buildLayout(
  plan: MitigationSemester[],
  overrides: Record<string, number>,
  violationIds: Set<string>,
  prerequisites: Prerequisite[],
): { nodes: Node[]; edges: Edge[]; semesterCols: SemesterCol[] } {
  // Flat course list with plan-assigned semester
  type Entry = { course: MitigationCourse; planSem: number }
  const allEntries: Entry[] = plan.flatMap((s) =>
    s.courses.map((c) => ({ course: c, planSem: s.semester })),
  )

  if (allEntries.length === 0) return { nodes: [], edges: [], semesterCols: [] }

  // Effective semester per course (overrides take precedence)
  const effectiveSem: Record<string, number> = {}
  allEntries.forEach(({ course, planSem }) => {
    effectiveSem[course.course_id] = overrides[course.course_id] ?? planSem
  })

  // Sorted unique semester numbers → column indices
  const uniqueSems = [...new Set(Object.values(effectiveSem))].sort((a, b) => a - b)
  const semToCol = new Map(uniqueSems.map((s, i) => [s, i]))
  const colX = (idx: number) => idx * (CARD_W + COL_GAP)

  const semesterCols: SemesterCol[] = uniqueSems.map((s) => ({
    semester: s,
    x: colX(semToCol.get(s)!),
  }))

  // Group courses by effective semester
  const bySem = new Map<number, Entry[]>()
  allEntries.forEach((entry) => {
    const s = effectiveSem[entry.course.course_id]
    const list = bySem.get(s) ?? []
    list.push(entry)
    bySem.set(s, list)
  })

  const nodes: Node[] = []

  uniqueSems.forEach((semNum) => {
    const idx = semToCol.get(semNum)!
    const coursesInSem = bySem.get(semNum) ?? []
    const creditsUsed = coursesInSem.reduce((sum, { course }) => sum + course.credits, 0)
    const extraCost = creditsUsed > 17 ? (creditsUsed - 17) * 866_400 : 0

    // Header node
    nodes.push({
      id: `__hdr_${semNum}`,
      type: 'semesterHeader',
      position: { x: colX(idx), y: 0 },
      data: {
        label: `Sem ${String(semNum).padStart(2, '0')}`,
        creditsUsed,
        extraCost,
      },
      draggable: false,
      selectable: false,
    })

    // Course nodes
    coursesInSem.forEach(({ course }, rowIdx) => {
      const nodeData: MitigationCourseNodeData = {
        ...course,
        hasViolation: violationIds.has(course.course_id),
      }
      nodes.push({
        id: course.course_id,
        type: 'mitigationNode',
        position: {
          x: colX(idx),
          y: HEADER_H + rowIdx * (CARD_H + ROW_GAP),
        },
        data: nodeData,
        draggable: true,
      })
    })
  })

  // Edges: only between courses present in this plan
  const planIds = new Set(allEntries.map((e) => e.course.course_id))
  const edges: Edge[] = prerequisites
    .filter((p) => planIds.has(p.source) && planIds.has(p.target))
    .map((p) => ({
      id: `${p.source}->${p.target}`,
      source: p.source,
      target: p.target,
      type: 'smoothstep',
      style: { stroke: '#CBD5E1', strokeWidth: 1.5 },
      animated: false,
    }))

  return { nodes, edges, semesterCols }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  plan: MitigationSemester[]
  prerequisites: Prerequisite[]
  violations: Violation[]
  overrides: Record<string, number>
  onNodeDrop: (courseId: string, newSemester: number) => void
}

export default function MitigationPlanFlow({
  plan,
  prerequisites,
  violations,
  overrides,
  onNodeDrop,
}: Props) {
  const violationIds = useMemo(
    () => new Set(violations.map((v) => v.course_id).filter(Boolean) as string[]),
    [violations],
  )

  const { nodes: layoutNodes, edges: layoutEdges, semesterCols } = useMemo(
    () => buildLayout(plan, overrides, violationIds, prerequisites),
    [plan, overrides, violationIds, prerequisites],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges)

  // Sync React Flow state whenever layout recomputes
  useEffect(() => {
    setNodes(layoutNodes)
    setEdges(layoutEdges)
  }, [layoutNodes, layoutEdges, setNodes, setEdges])

  // Store semesterCols in ref so onNodeDragStop always sees latest value
  const semColsRef = useRef(semesterCols)
  useEffect(() => {
    semColsRef.current = semesterCols
  }, [semesterCols])

  const onNodeDragStop: NodeDragHandler = useCallback(
    (_, node) => {
      if (node.type !== 'mitigationNode') return
      const cols = semColsRef.current
      if (cols.length === 0) return

      // Find nearest column by X position
      const nearest = cols.reduce((best, col) =>
        Math.abs(node.position.x - col.x) < Math.abs(node.position.x - best.x) ? col : best,
      )
      onNodeDrop(node.id, nearest.semester)
    },
    [onNodeDrop],
  )

  if (plan.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
        Sin plan de reorganización para este escenario
      </div>
    )
  }

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        nodesDraggable
        nodesConnectable={false}
        fitView
        fitViewOptions={{ padding: 0.15, minZoom: 0.25, maxZoom: 1.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#E2E8F0" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
