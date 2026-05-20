import { create } from 'zustand'
import type { Node, Edge } from 'reactflow'

export type CourseStatus =
  | 'approved'
  | 'in_progress'
  | 'pending'
  | 'blocked'
  | 'failed'
  | 'simulated'

export interface CourseNodeData {
  code: string
  name: string
  credits: number
  semester: number
  status: CourseStatus
}

export interface SemesterHeaderData {
  label: string
}

const CARD_W = 190
const CARD_H = 115
const COL_GAP = 72
const ROW_GAP = 16

function layoutNodes(
  rawNodes: Node<CourseNodeData>[],
): Node[] {
  // Group by semester, preserve order
  const bySem: Record<number, Node<CourseNodeData>[]> = {}
  rawNodes.forEach((n) => {
    const s = n.data.semester
    if (!bySem[s]) bySem[s] = []
    bySem[s].push(n)
  })

  const semesters = Object.keys(bySem).map(Number).sort((a, b) => a - b)

  // Course nodes with computed positions
  const positionedCourses: Node<CourseNodeData>[] = rawNodes.map((n) => {
    const s = n.data.semester
    const idx = bySem[s].findIndex((x) => x.id === n.id)
    const colIndex = semesters.indexOf(s)
    return {
      ...n,
      type: 'courseNode',
      position: {
        x: colIndex * (CARD_W + COL_GAP),
        y: 56 + idx * (CARD_H + ROW_GAP),
      },
    }
  })

  // Semester header nodes (non-interactive)
  const headerNodes: Node<SemesterHeaderData>[] = semesters.map((s, i) => ({
    id: `sem-header-${s}`,
    type: 'semesterHeader',
    position: { x: i * (CARD_W + COL_GAP), y: 0 },
    data: { label: `Semestre ${s}` },
    selectable: false,
    draggable: false,
    connectable: false,
  }))

  return [...headerNodes, ...positionedCourses]
}

interface GraphState {
  nodes: Node[]
  edges: Edge[]
  simulationMode: boolean
  selectedCourseId: string | null
  setGraph: (nodes: Node<CourseNodeData>[], edges: Edge[]) => void
  updateNodeStatus: (courseId: string, status: CourseStatus) => void
  applySimulationResult: (affectedIds: string[]) => void
  setSimulationMode: (active: boolean) => void
  setSelectedCourse: (id: string | null) => void
}

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  edges: [],
  simulationMode: false,
  selectedCourseId: null,

  setGraph: (rawNodes, edges) => {
    const nodes = layoutNodes(rawNodes)
    set({ nodes, edges })
  },

  updateNodeStatus: (courseId, status) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === courseId ? { ...n, data: { ...n.data, status } } : n,
      ),
    })),

  applySimulationResult: (affectedIds) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        affectedIds.includes(n.id)
          ? { ...n, data: { ...n.data, status: 'simulated' as CourseStatus } }
          : n,
      ),
    })),

  setSimulationMode: (active) => set({ simulationMode: active }),
  setSelectedCourse: (id) => set({ selectedCourseId: id }),
}))
