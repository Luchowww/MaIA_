import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, ArrowLeft, BarChart2, CheckCircle,
  ChevronDown, Clock, FlaskConical, Save,
} from 'lucide-react'
import { api } from '@/lib/api'
import MitigationPlanFlow from '@/components/simulation/MitigationPlanFlow'
import type { MitigationSemester, Prerequisite, Violation } from '@/components/simulation/MitigationPlanFlow'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Program { id: string; name: string }

interface GraphNode {
  id: string
  data: { code: string; name: string; credits: number; semester: number; status: string }
}

interface ImpactResult {
  affected_course_ids: string[]
  delay_semesters: number
  program_length: number
}

interface MitigationScenario {
  id: string
  label: string
  description: string
  semesters_delayed: number
  last_semester: number
  extra_credits_count: number
  extra_credits_cost: number
  difficulty_score: number
  plan: MitigationSemester[]
}

interface MitigationResult {
  lost_course: { id: string; name: string; code: string; credits: number; semester: number }
  current_semester: number
  program_length: number
  reference_delay: number
  reference_last_semester: number
  prerequisites: Prerequisite[]
  scenarios: MitigationScenario[]
}

type Phase = 'impact' | 'scenarios'
type ScenarioId = 'baseline' | 'advance' | 'extra_credits'

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  approved:    'bg-emerald-100 text-emerald-700',
  in_progress: 'bg-blue-100 text-blue-700',
  pending:     'bg-slate-100 text-slate-600',
  blocked:     'bg-amber-100 text-amber-700',
  failed:      'bg-red-100 text-red-700',
  simulated:   'bg-yellow-100 text-yellow-700',
}

const STATUS_LABEL: Record<string, string> = {
  approved: 'Aprobada', in_progress: 'En Curso', pending: 'Pendiente',
  blocked: 'Bloqueada', failed: 'Reprobada', simulated: 'Simulada',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function delayBadgeCls(delay: number) {
  if (delay === 0) return 'bg-emerald-100 text-emerald-700'
  if (delay <= 1)  return 'bg-amber-100 text-amber-700'
  return               'bg-red-100 text-red-700'
}

function difficultyInfo(score: number) {
  if (score === 0)  return { label: 'Baja',  cls: 'text-emerald-600' }
  if (score <= 30)  return { label: 'Media', cls: 'text-amber-600' }
  return             { label: 'Alta',  cls: 'text-red-600' }
}

// ── SimulationPage ─────────────────────────────────────────────────────────────

export default function SimulationPage() {
  const queryClient = useQueryClient()

  // ── Core state
  const [programId, setProgramId]             = useState<string | null>(null)
  const [selectedCourseId, setSelectedCourse] = useState<string | null>(null)
  const [impactResult, setImpactResult]       = useState<ImpactResult | null>(null)
  const [mitigationResult, setMitigResult]    = useState<MitigationResult | null>(null)

  // ── Phase / scenario state
  const [phase, setPhase]                     = useState<Phase>('impact')
  const [activeScenario, setActiveScenario]   = useState<ScenarioId>('advance')
  const [manualOverride, setOverride]         = useState<Record<string, number>>({})
  const [violations, setViolations]           = useState<Violation[]>([])

  // ── Save state
  const [scenarioName, setScenarioName]       = useState('')
  const [savedOk, setSavedOk]                 = useState(false)

  // ── Data fetching
  const { data: myProgramData } = useQuery<{ programs: Program[] }>({
    queryKey: ['my-program'],
    queryFn: () => api.get('/student-courses/my-program').then((r) => r.data),
  })
  const programs = myProgramData?.programs ?? []

  useEffect(() => {
    if (programs.length > 0 && !programId) setProgramId(programs[0].id)
  }, [programs, programId])

  const { data: graphData } = useQuery({
    queryKey: ['graph', programId],
    queryFn:  () => api.get(`/courses/graph?program_id=${programId}`).then((r) => r.data),
    enabled:  !!programId,
  })
  const nodes: GraphNode[] = graphData?.nodes ?? []

  const affectedSet = new Set(impactResult?.affected_course_ids ?? [])

  // Agrupar por categoría de estado
  const STATUS_GROUPS = [
    { key: 'active',  label: 'Cursadas',   statuses: ['approved', 'in_progress'] },
    { key: 'future',  label: 'Por Cursar', statuses: ['pending', 'blocked', 'failed'] },
  ] as const

  // Dentro de cada grupo, agrupar por semestre
  const groupedNodes = STATUS_GROUPS.map((group) => {
    const groupNodes = nodes.filter((n) => (group.statuses as readonly string[]).includes(n.data.status))
    const bySem: Record<number, GraphNode[]> = {}
    groupNodes.forEach((n) => {
      const s = n.data.semester
      if (!bySem[s]) bySem[s] = []
      bySem[s].push(n)
    })
    const sems = Object.keys(bySem).map(Number).sort((a, b) => a - b)
    return { ...group, bySem, sems }
  }).filter((g) => g.sems.length > 0)

  // Status de la materia seleccionada (para lenguaje contextual)
  const selectedNode = nodes.find((n) => n.id === selectedCourseId)
  const isFutureSimulation = selectedNode
    ? ['pending', 'blocked', 'failed'].includes(selectedNode.data.status)
    : false

  // ── Simulate mutation
  const simulateMutation = useMutation({
    mutationFn: (courseId: string) =>
      Promise.all([
        api.post('/simulation/loss',     { course_id: courseId, program_id: programId }).then((r) => r.data),
        api.post('/simulation/mitigate', { course_id: courseId, program_id: programId }).then((r) => r.data),
      ]),
    onSuccess: ([impact, mitigation]: [ImpactResult, MitigationResult]) => {
      setImpactResult(impact)
      setMitigResult(mitigation)
      setPhase('impact')
      setActiveScenario('advance')
      setOverride({})
      setViolations([])
      setScenarioName('')
      setSavedOk(false)
    },
  })

  // ── Validate plan mutation
  const validateMutation = useMutation({
    mutationFn: (planEntries: Array<{ course_id: string; assigned_semester: number }>) =>
      api.post('/simulation/validate', {
        program_id: programId,
        plan: planEntries,
      }).then((r) => r.data),
    onSuccess: (data) => setViolations(data.violations ?? []),
  })

  // ── Save scenario mutation
  const saveMutation = useMutation({
    mutationFn: () =>
      api.post('/simulation/scenarios', {
        course_id: selectedCourseId,
        program_id: programId,
        name: scenarioName.trim(),
      }).then((r) => r.data),
    onSuccess: () => {
      setSavedOk(true)
      setScenarioName('')
      queryClient.invalidateQueries({ queryKey: ['scenarios'] })
    },
  })

  // ── Reset
  const resetSelection = (newProgramId?: string) => {
    if (newProgramId) setProgramId(newProgramId)
    setSelectedCourse(null)
    setImpactResult(null)
    setMitigResult(null)
    setPhase('impact')
    setActiveScenario('advance')
    setOverride({})
    setViolations([])
    setSavedOk(false)
  }

  // ── Active scenario helpers
  const activeScenarioData = mitigationResult?.scenarios.find((s) => s.id === activeScenario)

  const effectiveLastSem = useMemo(() => {
    if (!activeScenarioData) return 0
    if (Object.keys(manualOverride).length === 0) return activeScenarioData.last_semester
    const allSems = [
      ...activeScenarioData.plan.map((s) => s.semester),
      ...Object.values(manualOverride),
    ]
    return Math.max(...allSems)
  }, [activeScenarioData, manualOverride])

  const effectiveDelay = useMemo(() => {
    if (!activeScenarioData || !mitigationResult) return 0
    return Math.max(0, effectiveLastSem - mitigationResult.program_length)
  }, [activeScenarioData, effectiveLastSem, mitigationResult])

  // ── Handle node drag-and-drop
  const handleNodeDrop = useCallback(
    (courseId: string, newSemester: number) => {
      const nextOverride = { ...manualOverride, [courseId]: newSemester }
      setOverride(nextOverride)

      if (activeScenarioData) {
        const planEntries = activeScenarioData.plan.flatMap((s) =>
          s.courses.map((c) => ({
            course_id: c.course_id,
            assigned_semester: nextOverride[c.course_id] ?? s.semester,
          })),
        )
        validateMutation.mutate(planEntries)
      }
    },
    [manualOverride, activeScenarioData, validateMutation],
  )

  // ── Switch scenario (reset overrides + violations)
  const handleSwitchScenario = (id: ScenarioId) => {
    setActiveScenario(id)
    setOverride({})
    setViolations([])
  }

  const isModified = Object.keys(manualOverride).length > 0

  // ── Computed stats for left panel
  const advancedCount = activeScenarioData?.plan.flatMap((s) => s.courses).filter((c) => c.moved_from !== null).length ?? 0
  const delayedCount  = activeScenarioData?.plan.flatMap((s) => s.courses).filter((c) => c.delayed_from !== null).length ?? 0
  const diff = difficultyInfo(activeScenarioData?.difficulty_score ?? 0)

  // ──────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">

      {/* ── LEFT PANEL ──────────────────────────────────────────────────────────── */}
      <div className="w-80 min-w-[280px] border-r border-slate-200 bg-white flex flex-col h-full overflow-hidden">

        {phase === 'scenarios' && mitigationResult ? (
          /* ── Phase 2 left: scenario stats + save ── */
          <>
            <div className="p-5 border-b border-slate-100">
              <button
                onClick={() => setPhase('impact')}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium mb-4 transition-colors"
              >
                <ArrowLeft size={13} /> Volver al análisis de impacto
              </button>
              <h2 className="text-sm font-semibold text-slate-900">
                {activeScenarioData?.label ?? 'Escenario'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                {isFutureSimulation ? 'Hipotético: ' : 'Pérdida de '}
                <strong>{mitigationResult.lost_course.name}</strong>
              </p>
            </div>

            {/* Stats grid */}
            {activeScenarioData && (
              <div className="p-4 border-b border-slate-100 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Retraso estimado</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${delayBadgeCls(effectiveDelay)}`}>
                    {effectiveDelay === 0 ? 'Sin retraso' : `+${effectiveDelay} sem`}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 rounded-lg p-2.5 text-center">
                    <p className="text-base font-bold text-slate-900">{effectiveLastSem}</p>
                    <p className="text-[10px] text-slate-500">sem graduación</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2.5 text-center">
                    <p className={`text-base font-bold ${activeScenarioData.extra_credits_cost > 0 ? 'text-amber-700' : 'text-emerald-600'}`}>
                      {activeScenarioData.extra_credits_cost > 0
                        ? `$${(activeScenarioData.extra_credits_cost / 1_000_000).toFixed(1)}M`
                        : '$0'}
                    </p>
                    <p className="text-[10px] text-slate-500">costo extra</p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 text-xs text-slate-600">
                  {advancedCount > 0 && (
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
                      {advancedCount} materia(s) adelantada(s)
                    </span>
                  )}
                  {delayedCount > 0 && (
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
                      {delayedCount} materia(s) retrasada(s)
                    </span>
                  )}
                  <span className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold ${diff.cls}`}>●</span>
                    Dificultad {diff.label}
                  </span>
                </div>

                {isModified && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                    <AlertTriangle size={11} /> Plan modificado manualmente
                  </p>
                )}

                {violations.length > 0 && (
                  <p className="text-[11px] text-red-600 bg-red-50 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                    <AlertTriangle size={11} /> {violations.length} violación(es) detectada(s)
                  </p>
                )}
              </div>
            )}

            {/* Legend */}
            <div className="p-4 border-b border-slate-100">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Leyenda</p>
              <div className="flex flex-col gap-1.5">
                {[
                  { cls: 'bg-red-50 border-red-300',     label: 'En repetición (perdida)' },
                  { cls: 'bg-indigo-50 border-indigo-300', label: 'Adelantada' },
                  { cls: 'bg-orange-50 border-orange-300', label: 'Retrasada por cascada' },
                  { cls: 'bg-white border-slate-200',    label: 'Sin cambios' },
                ].map(({ cls, label }) => (
                  <span key={label} className="flex items-center gap-2 text-xs text-slate-600">
                    <span className={`w-3.5 h-3.5 rounded border-2 flex-shrink-0 ${cls}`} />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Save */}
            <div className="p-4 mt-auto border-t border-slate-100">
              {savedOk ? (
                <div className="flex items-center gap-2 text-emerald-600 text-xs font-medium">
                  <CheckCircle size={14} /> Escenario guardado correctamente
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    placeholder="Nombre del escenario..."
                    value={scenarioName}
                    onChange={(e) => setScenarioName(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={() => saveMutation.mutate()}
                    disabled={!scenarioName.trim() || saveMutation.isPending || violations.length > 0}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors"
                  >
                    <Save size={13} />
                    {saveMutation.isPending ? 'Guardando...' : 'Guardar escenario'}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          /* ── Phase 1 left: simulation controls ── */
          <>
            <div className="p-5 border-b border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold text-slate-900">Simulación de impacto</h2>
                <FlaskConical size={16} className="text-slate-400" />
              </div>
              <p className="text-xs text-slate-500">Selecciona una materia para simular su pérdida</p>
            </div>

            {/* Program selector */}
            <div className="p-4 border-b border-slate-100">
              <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">
                Programa
              </label>
              <div className="relative">
                <select
                  value={programId ?? ''}
                  onChange={(e) => resetSelection(e.target.value)}
                  className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-8"
                >
                  <option value="">Seleccionar programa...</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Course list — grouped by status category */}
            {programId && (
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
                {groupedNodes.map((group) => (
                  <div key={group.key}>
                    {/* Group header */}
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        group.key === 'active' ? 'bg-emerald-400' : 'bg-slate-300'
                      }`} />
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        {group.label}
                      </p>
                      {group.key === 'future' && (
                        <span className="text-[9px] text-slate-400 font-normal normal-case tracking-normal">
                          · simulación hipotética
                        </span>
                      )}
                    </div>

                    {/* Courses by semester within the group */}
                    <div className="flex flex-col gap-3">
                      {group.sems.map((sem) => (
                        <div key={sem}>
                          <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5 pl-0.5">
                            Sem {String(sem).padStart(2, '0')}
                          </p>
                          <div className="flex flex-col gap-1.5">
                            {group.bySem[sem].map((n) => {
                              const isSelected = selectedCourseId === n.id
                              const isAffected = affectedSet.has(n.id)
                              return (
                                <button
                                  key={n.id}
                                  onClick={() => {
                                    setSelectedCourse(isSelected ? null : n.id)
                                    setImpactResult(null)
                                    setMitigResult(null)
                                    setSavedOk(false)
                                  }}
                                  className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${
                                    isSelected
                                      ? 'border-red-300 bg-red-50'
                                      : isAffected
                                      ? 'border-amber-200 bg-amber-50'
                                      : 'border-slate-200 bg-white hover:border-slate-300'
                                  }`}
                                >
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                                    isAffected ? 'bg-amber-200 text-amber-800' : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {n.data.code.slice(0, 4)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-slate-900 truncate">{n.data.name}</p>
                                    <p className="text-[10px] text-slate-400">{n.data.credits} cr</p>
                                  </div>
                                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_BADGE[n.data.status] ?? 'bg-slate-100 text-slate-500'}`}>
                                    {STATUS_LABEL[n.data.status] ?? n.data.status}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Impact summary */}
            {impactResult && (
              <div className="p-4 border-t border-slate-100 bg-amber-50">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-700">Impacto estimado</p>
                  <Clock size={13} className="text-amber-500" />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 bg-white rounded-lg p-2.5 border border-amber-100 text-center">
                    <p className="text-lg font-bold text-slate-900">{impactResult.affected_course_ids.length}</p>
                    <p className="text-[10px] text-slate-500">afectadas</p>
                  </div>
                  <div className="flex-1 bg-white rounded-lg p-2.5 border border-amber-100 text-center">
                    <p className="text-lg font-bold text-slate-900">+{impactResult.delay_semesters}</p>
                    <p className="text-[10px] text-slate-500">sem retraso</p>
                  </div>
                </div>
              </div>
            )}

            {/* Simulate button */}
            {selectedCourseId && (
              <div className="p-4 border-t border-slate-100">
                <button
                  onClick={() => simulateMutation.mutate(selectedCourseId)}
                  disabled={simulateMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
                >
                  <FlaskConical size={15} />
                  {simulateMutation.isPending ? 'Calculando...' : 'Simular impacto'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 bg-slate-50 flex flex-col overflow-hidden">

        {phase === 'scenarios' && mitigationResult ? (
          /* ── Phase 2: React Flow mitigation plan ── */
          <>
            {/* Header with scenario tabs */}
            <div className="px-6 py-3 border-b border-slate-200 bg-white">
              <div className="flex items-center gap-4 mb-2">
                <h2 className="text-sm font-semibold text-slate-900 whitespace-nowrap">
                  Plan de mitigación
                </h2>
                {/* Scenario tabs */}
                <div className="flex gap-1 p-1 bg-slate-100 rounded-xl flex-1 max-w-md">
                  {mitigationResult.scenarios.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSwitchScenario(s.id as ScenarioId)}
                      className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-all flex items-center justify-center gap-1 ${
                        activeScenario === s.id
                          ? 'bg-white shadow text-slate-900'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <span className="truncate">{s.label}</span>
                      <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full flex-shrink-0 ${delayBadgeCls(s.semesters_delayed)}`}>
                        {s.semesters_delayed === 0 ? '0' : `+${s.semesters_delayed}`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              {activeScenarioData && (
                <p className="text-xs text-slate-500">{activeScenarioData.description}</p>
              )}
            </div>

            {/* Violation banner */}
            {violations.length > 0 && (
              <div className="border-b border-red-200 bg-red-50">
                {/* Header row */}
                <div className="px-4 py-2 flex items-center gap-2">
                  <AlertTriangle size={13} className="text-red-600 flex-shrink-0" />
                  <span className="text-xs font-semibold text-red-700">
                    {violations.length} violación{violations.length > 1 ? 'es' : ''} detectada{violations.length > 1 ? 's' : ''}
                  </span>
                </div>
                {/* Individual violations */}
                <ul className="px-4 pb-2.5 flex flex-col gap-1 max-h-32 overflow-y-auto">
                  {violations.map((v, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                      <span className="text-[11px] text-red-700 leading-snug">
                        {v.course_name && (
                          <span className="font-semibold">{v.course_name}: </span>
                        )}
                        {v.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Drag hint */}
            {!isModified && activeScenarioData && activeScenarioData.plan.length > 0 && (
              <div className="px-6 py-1.5 border-b border-slate-100 bg-slate-50">
                <p className="text-[11px] text-slate-400">
                  Arrastra materias entre columnas para ajustar el plan manualmente
                </p>
              </div>
            )}

            {/* React Flow */}
            <div className="flex-1 overflow-hidden">
              {activeScenarioData ? (
                <MitigationPlanFlow
                  plan={activeScenarioData.plan}
                  prerequisites={mitigationResult.prerequisites}
                  violations={violations}
                  overrides={manualOverride}
                  onNodeDrop={handleNodeDrop}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                  Selecciona un escenario
                </div>
              )}
            </div>
          </>

        ) : !programId ? (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center text-center">
            <div>
              <FlaskConical size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-400">Selecciona un programa para comenzar</p>
              <p className="text-xs text-slate-300 mt-1">Luego elige una materia y simula su pérdida</p>
            </div>
          </div>

        ) : (
          /* ── Phase 1: Curriculum view ── */
          <>
            <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Vista del currículo</h2>
              <div className="flex items-center gap-3">
                {(['approved', 'in_progress', 'pending'] as const).map((s) => (
                  <span key={s} className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className={`w-2 h-2 rounded-full inline-block ${
                      s === 'approved' ? 'bg-emerald-400' : s === 'in_progress' ? 'bg-blue-400' : 'bg-slate-300'
                    }`} />
                    {STATUS_LABEL[s]}
                  </span>
                ))}
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Afectada
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6 flex flex-col gap-4">
              {/* Affected courses banner */}
              {impactResult && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
                  <AlertTriangle size={13} className="flex-shrink-0" />
                  <span>
                    <strong>{impactResult.affected_course_ids.length} materias</strong> afectadas —
                    retraso estimado de{' '}
                    <strong>+{impactResult.delay_semesters} semestre(s)</strong> sin cambios.
                    {mitigationResult && ' Explora las opciones de mitigación.'}
                  </span>
                </div>
              )}

              {/* Curriculum grid */}
              <div className="flex gap-5 pb-2">
                {semesters.map((sem) => (
                  <div key={sem} className="flex flex-col gap-2 min-w-[175px]">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 text-center mb-1">
                      Sem {String(sem).padStart(2, '0')}
                    </p>
                    {bySemester[sem].map((n) => {
                      const isAffected = affectedSet.has(n.id)
                      const isSelected = selectedCourseId === n.id
                      return (
                        <div
                          key={n.id}
                          className={`rounded-xl border p-3 transition-all ${
                            isSelected
                              ? 'border-red-300 bg-red-50 shadow-md'
                              : isAffected
                              ? 'border-amber-300 bg-amber-50 shadow-sm'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <p className="text-[10px] text-slate-400 font-mono">{n.data.code}</p>
                          <p className="text-xs font-semibold text-slate-900 mt-0.5 line-clamp-2">{n.data.name}</p>
                          <span className={`inline-block mt-1.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                            isSelected ? 'bg-red-100 text-red-700'
                            : isAffected ? STATUS_BADGE['simulated']
                            : (STATUS_BADGE[n.data.status] ?? 'bg-slate-100 text-slate-500')
                          }`}>
                            {isSelected ? 'PERDIDA' : isAffected ? 'AFECTADA' : (STATUS_LABEL[n.data.status] ?? n.data.status)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>

              {/* CTA button to go to phase 2 */}
              {mitigationResult && (
                <button
                  onClick={() => setPhase('scenarios')}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg transition-colors"
                >
                  <BarChart2 size={16} />
                  Ver opciones de reducción de impacto
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
