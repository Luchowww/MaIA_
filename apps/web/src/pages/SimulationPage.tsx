import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FlaskConical, Clock, TrendingUp, ChevronDown, Save, CheckCircle } from 'lucide-react'
import { api } from '@/lib/api'

interface Program {
  id: string
  name: string
}

interface SimulationResult {
  affected_course_ids: string[]
  estimated_semesters: number
}

export default function SimulationPage() {
  const queryClient = useQueryClient()
  const [programId, setProgramId] = useState<string | null>(null)
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null)
  const [scenarioName, setScenarioName] = useState('')
  const [savedOk, setSavedOk] = useState(false)

  const { data: programs } = useQuery<Program[]>({
    queryKey: ['programs'],
    queryFn: () => api.get('/admin/programs').then((r) => r.data),
  })

  const { data: graphData } = useQuery({
    queryKey: ['graph', programId],
    queryFn: () => api.get(`/courses/graph?program_id=${programId}`).then((r) => r.data),
    enabled: !!programId,
  })

  const nodes = graphData?.nodes ?? []

  const simulateMutation = useMutation({
    mutationFn: (courseId: string) =>
      api.post('/simulation/loss', { course_id: courseId, program_id: programId }).then((r) => r.data),
    onSuccess: (data: SimulationResult) => {
      setSimulationResult(data)
      setScenarioName('')
      setSavedOk(false)
    },
  })

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

  const bySemester: Record<number, typeof nodes> = {}
  nodes.forEach((n: { data: { semester: number } }) => {
    const s = n.data.semester
    if (!bySemester[s]) bySemester[s] = []
    bySemester[s].push(n)
  })
  const semesters = Object.keys(bySemester).map(Number).sort((a, b) => a - b)

  const affectedSet = new Set(simulationResult?.affected_course_ids ?? [])

  const STATUS_BADGE: Record<string, string> = {
    approved: 'bg-emerald-100 text-emerald-700',
    in_progress: 'bg-blue-100 text-blue-700',
    pending: 'bg-slate-100 text-slate-600',
    blocked: 'bg-amber-100 text-amber-700',
    failed: 'bg-red-100 text-red-700',
    simulated: 'bg-yellow-100 text-yellow-700',
  }

  const STATUS_LABEL: Record<string, string> = {
    approved: 'Aprobada',
    in_progress: 'En Curso',
    pending: 'Pendiente',
    blocked: 'Bloqueada',
    failed: 'Reprobada',
    simulated: 'Simulada',
  }

  const canSave = simulationResult && scenarioName.trim().length > 0 && !savedOk

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-80 min-w-[280px] border-r border-slate-200 bg-white flex flex-col h-full overflow-y-auto">
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-slate-900">Simulation Controls</h2>
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
              onChange={(e) => {
                setProgramId(e.target.value)
                setSimulationResult(null)
                setSelectedCourseId(null)
                setSavedOk(false)
              }}
              className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-8"
            >
              <option value="">Seleccionar programa...</option>
              {programs?.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Course list */}
        {programId && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {semesters.map((sem) => (
              <div key={sem}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
                  Semestre {sem.toString().padStart(2, '0')}
                </p>
                <div className="flex flex-col gap-2">
                  {bySemester[sem].map((n: { id: string; data: { code: string; name: string; credits: number; status: string } }) => {
                    const isSelected = selectedCourseId === n.id
                    const isAffected = affectedSet.has(n.id)
                    return (
                      <button
                        key={n.id}
                        onClick={() => {
                          setSelectedCourseId(isSelected ? null : n.id)
                          setSimulationResult(null)
                          setSavedOk(false)
                        }}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-red-300 bg-red-50'
                            : isAffected
                            ? 'border-amber-200 bg-amber-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
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
        )}

        {/* Impact summary */}
        {simulationResult && (
          <div className="p-4 border-t border-slate-100 bg-amber-50 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">Impacto de la simulación</p>
              <Clock size={13} className="text-amber-500" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 bg-white rounded-lg p-2.5 border border-amber-100 text-center">
                <p className="text-lg font-bold text-slate-900">{simulationResult.affected_course_ids.length}</p>
                <p className="text-[10px] text-slate-500">materias afectadas</p>
              </div>
              <div className="flex-1 bg-white rounded-lg p-2.5 border border-amber-100 text-center">
                <p className="text-lg font-bold text-slate-900">+{simulationResult.estimated_semesters}</p>
                <p className="text-[10px] text-slate-500">semestres de retraso</p>
              </div>
            </div>

            {/* Save as scenario */}
            {savedOk ? (
              <div className="flex items-center gap-2 text-emerald-600 text-xs font-medium">
                <CheckCircle size={14} />
                Escenario guardado correctamente
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Nombre del escenario..."
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={!canSave || saveMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors"
                >
                  <Save size={13} />
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar escenario'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Run button */}
        {selectedCourseId && (
          <div className="p-4 border-t border-slate-100">
            <button
              onClick={() => simulateMutation.mutate(selectedCourseId)}
              disabled={simulateMutation.isPending}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              <FlaskConical size={15} />
              {simulateMutation.isPending ? 'Calculando...' : 'Run Simulation'}
            </button>
          </div>
        )}
      </div>

      {/* Right: impact visualization */}
      <div className="flex-1 bg-slate-50 flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Curriculum Impact Visualization</h2>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Aprobada
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> En Curso
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Afectada
            </span>
          </div>
        </div>

        {!programId ? (
          <div className="flex-1 flex items-center justify-center text-center">
            <div>
              <FlaskConical size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-400">Selecciona un programa para comenzar</p>
              <p className="text-xs text-slate-300 mt-1">Luego elige una materia para simular su pérdida</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-6">
            {simulationResult && (
              <div className="mb-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
                <TrendingUp size={13} />
                <span>
                  Esta simulación afecta <strong>{simulationResult.affected_course_ids.length} materias</strong> y
                  genera un retraso estimado de <strong>+{simulationResult.estimated_semesters} semestre(s)</strong>.
                  Este resultado es temporal — guárdalo como escenario para consultarlo después.
                </span>
              </div>
            )}
            <div className="flex gap-6">
              {semesters.map((sem) => (
                <div key={sem} className="flex flex-col gap-2 min-w-[180px]">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 text-center mb-1">
                    Sem {sem.toString().padStart(2, '0')}
                  </p>
                  {bySemester[sem].map((n: { id: string; data: { code: string; name: string; status: string } }) => {
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
                        <p className="text-xs font-semibold text-slate-900 mt-0.5">{n.data.name}</p>
                        <span className={`inline-block mt-1.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                          isSelected
                            ? 'bg-red-100 text-red-700'
                            : isAffected
                            ? STATUS_BADGE['simulated']
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
          </div>
        )}
      </div>
    </div>
  )
}
