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

interface GraphState {
  nodes: Node<CourseNodeData>[]
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

  setGraph: (nodes, edges) => set({ nodes, edges }),

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
