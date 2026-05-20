import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GraduationCap, ChevronRight, ChevronLeft, Check, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'

interface Program {
  id: string
  name: string
  is_active: boolean
}

interface Course {
  id: string
  code: string
  name: string
  credits: number
  semester: number
  program_id: string
}

interface Props {
  onComplete: () => void
}

// ─── Step indicators ──────────────────────────────────────────────────────────

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
      done ? 'bg-emerald-500 text-white' : active ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-400'
    }`}>
      {done ? <Check size={14} /> : n}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage({ onComplete }: Props) {
  const [step, setStep] = useState(1)
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null)
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1: Programs
  const { data: programs = [], isLoading: loadingPrograms } = useQuery<Program[]>({
    queryKey: ['onboarding', 'programs'],
    queryFn: () => api.get('/programs').then((r) => r.data.filter((p: Program) => p.is_active)),
  })

  // Step 2: Courses for selected program
  const { data: courses = [], isLoading: loadingCourses } = useQuery<Course[]>({
    queryKey: ['onboarding', 'courses', selectedProgram?.id],
    queryFn: () => api.get(`/courses?program_id=${selectedProgram!.id}`).then((r) => r.data),
    enabled: !!selectedProgram,
  })

  const grouped = courses.reduce((acc, c) => {
    if (!acc[c.semester]) acc[c.semester] = []
    acc[c.semester].push(c)
    return acc
  }, {} as Record<number, Course[]>)

  const toggleCourse = (id: string) => {
    const next = new Set(approvedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setApprovedIds(next)
  }

  const selectAllSemester = (semCourses: Course[]) => {
    const next = new Set(approvedIds)
    const allSelected = semCourses.every((c) => next.has(c.id))
    semCourses.forEach((c) => allSelected ? next.delete(c.id) : next.add(c.id))
    setApprovedIds(next)
  }

  const handleSubmit = async () => {
    if (!selectedProgram) return
    setSubmitting(true)
    setError(null)
    try {
      await api.post('/onboarding/submit', {
        program_id: selectedProgram.id,
        approved_course_ids: Array.from(approvedIds),
      })
      onComplete()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Error al guardar. Intenta de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-12">
      {/* Card */}
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-700 px-8 py-6 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
              <GraduationCap size={18} />
            </div>
            <div>
              <p className="text-xs text-white/60">Bienvenido a</p>
              <p className="text-base font-bold leading-none">MaIA</p>
            </div>
          </div>
          <h1 className="text-xl font-bold">Configuremos tu perfil académico</h1>
          <p className="text-sm text-white/70 mt-1">Solo tomará un minuto. Esta información personaliza tu experiencia.</p>

          {/* Step indicator */}
          <div className="flex items-center gap-3 mt-5">
            {[1, 2, 3].map((n, i) => (
              <div key={n} className="flex items-center gap-3">
                <StepDot n={n} active={step === n} done={step > n} />
                {i < 2 && <div className={`h-px w-8 transition-colors ${step > n + 1 ? 'bg-emerald-400' : 'bg-white/20'}`} />}
              </div>
            ))}
            <div className="ml-1 text-xs text-white/50">
              {step === 1 && 'Carrera'}
              {step === 2 && 'Materias aprobadas'}
              {step === 3 && 'Confirmación'}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-8 py-6">
          {/* Step 1: Select program */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">¿Qué carrera estás cursando?</h2>
                <p className="text-sm text-slate-500 mt-0.5">Selecciona tu programa académico</p>
              </div>

              {loadingPrograms ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
                  <Loader2 size={14} className="animate-spin" /> Cargando programas...
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {programs.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProgram(p)}
                      className={`flex items-center justify-between px-4 py-3.5 rounded-xl border text-left transition-all ${
                        selectedProgram?.id === p.id
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span className="text-sm font-medium">{p.name}</span>
                      {selectedProgram?.id === p.id && <Check size={16} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Select approved courses */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">¿Qué materias ya aprobaste?</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Marca todas las materias que ya hayas cursado y aprobado.
                  {approvedIds.size > 0 && <span className="text-indigo-600 font-medium"> ({approvedIds.size} seleccionadas)</span>}
                </p>
              </div>

              {loadingCourses ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
                  <Loader2 size={14} className="animate-spin" /> Cargando materias...
                </div>
              ) : (
                <div className="flex flex-col gap-3 max-h-[380px] overflow-y-auto pr-1">
                  {Object.entries(grouped).sort(([a], [b]) => +a - +b).map(([sem, semCourses]) => {
                    const allSemSelected = semCourses.every((c) => approvedIds.has(c.id))
                    return (
                      <div key={sem} className="flex flex-col gap-1">
                        <button
                          onClick={() => selectAllSemester(semCourses)}
                          className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-700 transition-colors"
                        >
                          <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${allSemSelected ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                            {allSemSelected && <Check size={9} className="text-white" />}
                          </div>
                          Semestre {sem}
                        </button>
                        <div className="flex flex-col gap-1 pl-1">
                          {semCourses.map((c) => {
                            const checked = approvedIds.has(c.id)
                            return (
                              <button
                                key={c.id}
                                onClick={() => toggleCourse(c.id)}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                                  checked
                                    ? 'border-emerald-200 bg-emerald-50'
                                    : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                                  checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                                }`}>
                                  {checked && <Check size={10} className="text-white" />}
                                </div>
                                <code className="text-xs font-mono text-slate-500 w-16 flex-shrink-0">{c.code}</code>
                                <span className="text-sm text-slate-700 font-medium">{c.name}</span>
                                <span className="ml-auto text-xs text-slate-400 flex-shrink-0">{c.credits} cr</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Summary */}
          {step === 3 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Resumen de tu perfil</h2>
                <p className="text-sm text-slate-500 mt-0.5">Confirma que todo está correcto antes de empezar</p>
              </div>

              <div className="flex flex-col gap-3">
                <div className="bg-slate-50 rounded-xl px-4 py-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Carrera</p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">{selectedProgram?.name}</p>
                  </div>
                  <button onClick={() => setStep(1)} className="text-xs text-indigo-600 hover:underline">Cambiar</button>
                </div>
                <div className="bg-slate-50 rounded-xl px-4 py-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Materias aprobadas</p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">
                      {approvedIds.size === 0 ? 'Ninguna (primer semestre)' : `${approvedIds.size} materias`}
                    </p>
                  </div>
                  <button onClick={() => setStep(2)} className="text-xs text-indigo-600 hover:underline">Cambiar</button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-slate-100 flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              <ChevronLeft size={16} /> Atrás
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && !selectedProgram}
              className="flex items-center gap-1.5 bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              Continuar <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : <><Check size={14} /> Comenzar</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
