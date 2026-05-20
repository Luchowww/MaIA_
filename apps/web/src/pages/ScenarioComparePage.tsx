import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Trophy, Clock, BookOpen, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api'

interface AffectedCourse {
  course_id: string
  semester: number
  name: string
  code: string
}

interface ScenarioDetail {
  id: string
  name: string
  affected_count: number
  estimated_semesters: number
  triggered_course_id: string
  created_at: string
  affected_courses: AffectedCourse[]
}

interface CompareResult {
  scenarios: ScenarioDetail[]
  best_scenario_id: string
  best_scenario_name: string
}

interface Props {
  scenarioIds: string[]
  onBack: () => void
}

const SEMESTER_COLORS = [
  'bg-slate-100 text-slate-600',
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-pink-100 text-pink-700',
  'bg-orange-100 text-orange-700',
  'bg-teal-100 text-teal-700',
  'bg-cyan-100 text-cyan-700',
  'bg-lime-100 text-lime-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
]

export default function ScenarioComparePage({ scenarioIds, onBack }: Props) {
  const { data, isLoading, isError } = useQuery<CompareResult>({
    queryKey: ['scenarios-compare', scenarioIds],
    queryFn: () =>
      api.get(`/simulation/scenarios/compare?ids=${scenarioIds.join(',')}`).then((r) => r.data),
    enabled: scenarioIds.length >= 2,
  })

  const delayBg = (sems: number) => {
    if (sems === 0) return 'bg-emerald-50 border-emerald-200 text-emerald-700'
    if (sems <= 2) return 'bg-amber-50 border-amber-200 text-amber-700'
    return 'bg-red-50 border-red-200 text-red-700'
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        Comparando escenarios...
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
        <AlertCircle size={32} className="text-red-300" />
        <p className="text-sm">No se pudo cargar la comparación.</p>
        <button onClick={onBack} className="text-xs text-indigo-600 underline">Volver</button>
      </div>
    )
  }

  const { scenarios, best_scenario_id } = data

  // Build unified course list sorted by semester
  const allCoursesMap = new Map<string, AffectedCourse>()
  scenarios.forEach((s) => {
    s.affected_courses.forEach((c) => {
      if (!allCoursesMap.has(c.course_id)) allCoursesMap.set(c.course_id, c)
    })
  })
  const allCourses = Array.from(allCoursesMap.values()).sort(
    (a, b) => a.semester - b.semester || a.code.localeCompare(b.code)
  )

  // Group by semester for the matrix
  const bySemester: Record<number, AffectedCourse[]> = {}
  allCourses.forEach((c) => {
    if (!bySemester[c.semester]) bySemester[c.semester] = []
    bySemester[c.semester].push(c)
  })
  const semesters = Object.keys(bySemester).map(Number).sort((a, b) => a - b)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft size={15} />
          Volver
        </button>
        <div className="h-4 w-px bg-slate-200" />
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Comparación de escenarios</h2>
          <p className="text-xs text-slate-500">
            Comparando {scenarios.length} escenarios — impacto acumulado en la malla
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
        {/* Winner banner */}
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4">
          <Trophy size={20} className="text-emerald-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">
              Mejor escenario: <span className="underline">{data.best_scenario_name}</span>
            </p>
            <p className="text-xs text-emerald-600 mt-0.5">
              Este escenario genera el menor retraso en la graduación
            </p>
          </div>
        </div>

        {/* Scenario cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {scenarios.map((s) => {
            const isBest = s.id === best_scenario_id
            return (
              <div
                key={s.id}
                className={`rounded-2xl border-2 p-5 ${
                  isBest ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                  {isBest && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      <Trophy size={9} /> Mejor
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className={`flex-1 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${delayBg(s.estimated_semesters)}`}>
                    <Clock size={11} />
                    +{s.estimated_semesters} sem de retraso
                  </div>
                  <div className="flex-1 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                    <BookOpen size={11} />
                    {s.affected_count} materias
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Comparison matrix */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">Materias afectadas por escenario</p>
            <p className="text-[10px] text-slate-400">{allCourses.length} materias en total</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 w-16">Sem</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Materia</th>
                  {scenarios.map((s) => (
                    <th key={s.id} className="text-center px-4 py-2.5 font-semibold text-slate-600 min-w-[120px]">
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {semesters.map((sem) => (
                  <>
                    <tr key={`sem-header-${sem}`} className="bg-slate-50/50">
                      <td
                        colSpan={2 + scenarios.length}
                        className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400"
                      >
                        Semestre {sem.toString().padStart(2, '0')}
                      </td>
                    </tr>
                    {bySemester[sem].map((course) => {
                      const semColor = SEMESTER_COLORS[(sem - 1) % SEMESTER_COLORS.length]
                      return (
                        <tr key={course.course_id} className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-2.5">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${semColor}`}>
                              {sem}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="font-semibold text-slate-800">{course.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{course.code}</p>
                          </td>
                          {scenarios.map((s) => {
                            const inScenario = s.affected_courses.some(
                              (c) => c.course_id === course.course_id
                            )
                            return (
                              <td key={s.id} className="px-4 py-2.5 text-center">
                                {inScenario ? (
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold">
                                    ✕
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 text-[10px]">
                                    ✓
                                  </span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
