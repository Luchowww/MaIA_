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
const DEFAULT_EDGE_STYLE = { stroke: '#CBD5E1', strokeWidth: 2 }
const CASCADE_EDGE_STYLE = { stroke: '#F97316', strokeWidth: 3 }

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

function prepareEdges(edges: Edge[]): Edge[] {
  return edges.map((edge) => ({
    ...edge,
    animated: false,
    style: { ...DEFAULT_EDGE_STYLE, ...(edge.style ?? {}) },
  }))
}

function clearSelection(nodes: Node[]): Node[] {
  return nodes.map((node) => ({ ...node, selected: false }))
}

interface SimulationResult {
  failedId: string
  affectedIds: string[]
}

interface GraphState {
  nodes: Node[]
  edges: Edge[]
  baseNodes: Node[]
  baseEdges: Edge[]
  simulationMode: boolean
  selectedCourseId: string | null
  simulationResult: SimulationResult | null
  setGraph: (nodes: Node<CourseNodeData>[], edges: Edge[]) => void
  updateNodeStatus: (courseId: string, status: CourseStatus) => void
  runLossSimulation: (courseId: string) => void
  resetSimulation: () => void
  setSimulationMode: (active: boolean) => void
  setSelectedCourse: (id: string | null) => void
}

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  edges: [],
  baseNodes: [],
  baseEdges: [],
  simulationMode: false,
  selectedCourseId: null,
  simulationResult: null,

  setGraph: (rawNodes, edges) => {
    const nodes = layoutNodes(rawNodes)
    const preparedEdges = prepareEdges(edges)
    set({
      nodes,
      edges: preparedEdges,
      baseNodes: nodes,
      baseEdges: preparedEdges,
      simulationMode: false,
      selectedCourseId: null,
      simulationResult: null,
    })
  },

  updateNodeStatus: (courseId, status) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === courseId ? { ...n, data: { ...n.data, status } } : n,
      ),
      baseNodes: state.baseNodes.map((n) =>
        n.id === courseId ? { ...n, data: { ...n.data, status } } : n,
      ),
    })),

  runLossSimulation: (courseId) =>
    set((state) => {
      const affected = new Set<string>([courseId])
      const queue = [courseId]

      while (queue.length > 0) {
        const currentId = queue.shift()
        if (!currentId) continue

        state.baseEdges.forEach((edge) => {
          const source = String(edge.source)
          const target = String(edge.target)
          if (source === currentId && !affected.has(target)) {
            affected.add(target)
            queue.push(target)
          }
        })
      }

      const affectedIds = Array.from(affected)
      const nodes = state.baseNodes.map((node) => {
        if (node.type !== 'courseNode') return { ...node, selected: false }
        if (node.id === courseId) {
          return {
            ...node,
            selected: false,
            data: { ...node.data, status: 'failed' as CourseStatus },
          }
        }
        if (affected.has(node.id)) {
          return {
            ...node,
            selected: false,
            data: { ...node.data, status: 'simulated' as CourseStatus },
          }
        }
        return { ...node, selected: false }
      })

      const edges = state.baseEdges.map((edge) => {
        const source = String(edge.source)
        const target = String(edge.target)
        const inCascade = affected.has(source) && affected.has(target)

        return {
          ...edge,
          animated: inCascade,
          style: inCascade ? CASCADE_EDGE_STYLE : DEFAULT_EDGE_STYLE,
        }
      })

      return {
        nodes,
        edges,
        simulationMode: false,
        selectedCourseId: null,
        simulationResult: { failedId: courseId, affectedIds },
      }
    }),

  resetSimulation: () =>
    set((state) => ({
      nodes: clearSelection(state.baseNodes),
      edges: state.baseEdges,
      simulationMode: false,
      selectedCourseId: null,
      simulationResult: null,
    })),

  setSimulationMode: (active) =>
    set((state) => ({
      simulationMode: active,
      selectedCourseId: null,
      simulationResult: active ? null : state.simulationResult,
      nodes: active ? clearSelection(state.baseNodes) : clearSelection(state.nodes),
      edges: active ? state.baseEdges : state.edges,
    })),

  setSelectedCourse: (id) =>
    set((state) => ({
      selectedCourseId: id,
      nodes: state.nodes.map((node) =>
        node.type === 'courseNode'
          ? { ...node, selected: node.id === id }
          : { ...node, selected: false },
      ),
    })),
}))
