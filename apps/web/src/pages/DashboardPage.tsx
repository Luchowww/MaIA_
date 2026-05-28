import { useQuery } from '@tanstack/react-query'
import { ArrowRight, TrendingUp, BookOpen, Award, FlaskConical, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import type { Page } from '@/components/AppLayout'
import { useAuthStore } from '@/stores/authStore'

interface Program {
  id: string
  name: string
  is_active: boolean
}

interface CourseSummaryItem {
  id: string
  name: string
  code: string
  credits: number
  semester: number
}

interface StudentSummary {
  total_credits: number
  approved_credits: number
  in_progress_credits: number
  approved_count: number
  in_progress_courses: CourseSummaryItem[]
  next_available_courses: CourseSummaryItem[]
}

interface Props {
  onNavigate: (page: Page) => void
}

export default function DashboardPage({ onNavigate }: Props) {
  const { user } = useAuthStore()
  const displayName = user?.email?.split('@')[0] ?? 'Estudiante'

  const { data: myProgramData } = useQuery<{ programs: Program[] }>({
    queryKey: ['my-program'],
    queryFn: () => api.get('/student-courses/my-program').then((r) => r.data),
  })

  const myPrograms = myProgramData?.programs ?? []
  const programId = myPrograms[0]?.id

  const { data: summary, isLoading: summaryLoading } = useQuery<StudentSummary>({
    queryKey: ['student-summary', programId],
    queryFn: () => api.get(`/student-courses/summary?program_id=${programId}`).then((r) => r.data),
    enabled: !!programId,
  })

  const progressPct = summary && summary.total_credits > 0
    ? Math.round((summary.approved_credits / summary.total_credits) * 100)
    : 0

  const donutFill = progressPct
  const donutEmpty = 100 - donutFill

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-700 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/4 translate-x-1/4" />
        <div className="absolute bottom-0 right-20 w-32 h-32 bg-white/5 rounded-full translate-y-1/4" />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-white/60 mb-1">Bienvenido de vuelta</p>
            <h2 className="text-xl font-bold text-white capitalize">{displayName}</h2>
            <p className="text-sm text-white/70 mt-2 max-w-xs">
              Completa tu malla curricular y revisa tus materias disponibles para el próximo semestre.
            </p>
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => onNavigate('graph')}
                className="flex items-center gap-2 bg-white text-slate-900 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-slate-100 transition-colors"
              >
                Ver Malla <ArrowRight size={14} />
              </button>
              <button
                onClick={() => onNavigate('chat')}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
              >
                Open Advisor
              </button>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-white/50 uppercase tracking-wide">Créditos Aprobados</p>
            <p className="text-4xl font-bold text-white mt-1">
              {summaryLoading ? '—' : summary?.approved_credits ?? 0}
            </p>
            <p className="text-xs text-white/50 font-medium mt-1">
              de {summaryLoading ? '—' : summary?.total_credits ?? 0} totales
            </p>
            {!summaryLoading && summary && summary.in_progress_credits > 0 && (
              <p className="text-xs text-emerald-400 font-medium mt-1 flex items-center gap-1 justify-end">
                <TrendingUp size={11} /> {summary.in_progress_credits} cr. en curso
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Progreso</p>
            <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center">
              <Award size={14} className="text-indigo-600" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative w-14 h-14 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#E2E8F0" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke="#6366F1" strokeWidth="3"
                  strokeDasharray={`${donutFill} ${donutEmpty}`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-900">
                {summaryLoading ? '…' : `${progressPct}%`}
              </span>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{summaryLoading ? '—' : `${progressPct}%`}</p>
              <p className="text-xs text-slate-400">Completado</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {summaryLoading ? '— / —' : `${summary?.approved_credits ?? 0} / ${summary?.total_credits ?? 0} créditos`}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Programa</p>
            <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center">
              <BookOpen size={14} className="text-emerald-600" />
            </div>
          </div>
          {myPrograms.length === 0 ? (
            <p className="text-xs text-slate-400 mt-1">Sin programa asignado</p>
          ) : (
            <>
              <p className="text-2xl font-bold text-slate-900">{myPrograms.length}</p>
              <p className="text-xs text-slate-400 mt-1">
                {myPrograms.length === 1 ? 'programa activo' : 'programas activos'}
              </p>
              <div className="flex flex-col gap-1 mt-3">
                {myPrograms.slice(0, 2).map((p) => (
                  <span key={p.id} className="text-xs text-slate-600 truncate">• {p.name}</span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">En Curso</p>
            <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center">
              <FlaskConical size={14} className="text-amber-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {summaryLoading ? '—' : summary?.in_progress_courses.length ?? 0}
          </p>
          <p className="text-xs text-slate-400 mt-1">materias en progreso</p>
          <button
            onClick={() => onNavigate('simulation')}
            className="mt-3 flex items-center gap-1.5 text-xs text-indigo-600 font-medium hover:text-indigo-800 transition-colors"
          >
            <Plus size={11} /> Nueva simulación
          </button>
        </div>
      </div>

      {/* Recommended + In progress */}
      <div className="grid grid-cols-2 gap-4">
        {/* Recommended */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Disponibles para el Próximo Semestre</h3>
            <button
              onClick={() => onNavigate('graph')}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 transition-colors"
            >
              Ver malla <ArrowRight size={11} />
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {summaryLoading && (
              <div className="flex flex-col gap-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            )}
            {!summaryLoading && (summary?.next_available_courses.length ?? 0) === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">
                {!programId
                  ? 'Completa el onboarding para ver tus materias disponibles.'
                  : summary?.approved_count === 0
                  ? 'Marca materias como aprobadas en la malla para ver recomendaciones.'
                  : 'No hay materias pendientes desbloqueadas.'}
              </p>
            )}
            {!summaryLoading && summary?.next_available_courses.slice(0, 3).map((course) => (
              <div key={course.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-md flex-shrink-0 mt-0.5">
                  Sem. {course.semester}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">{course.name}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{course.code} · {course.credits} créditos</p>
                </div>
                <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md flex-shrink-0">
                  Disponible
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* In progress courses */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Materias en Progreso</h3>
            <button
              onClick={() => onNavigate('graph')}
              className="flex items-center gap-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              Ver malla
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {summaryLoading && (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            )}
            {!summaryLoading && (summary?.in_progress_courses.length ?? 0) === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">
                No tienes materias marcadas como en progreso.
              </p>
            )}
            {!summaryLoading && summary?.in_progress_courses.map((course) => (
              <div key={course.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                <div className="w-7 h-7 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <BookOpen size={13} className="text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-900 truncate">{course.name}</p>
                  <p className="text-[10px] text-slate-400">{course.code} · {course.credits} cr.</p>
                </div>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  En Progreso
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
