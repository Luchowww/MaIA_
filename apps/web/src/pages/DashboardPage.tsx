import { useQuery } from '@tanstack/react-query'
import { ArrowRight, TrendingUp, BookOpen, Award, FlaskConical, Plus, Eye } from 'lucide-react'
import { api } from '@/lib/api'
import type { Page } from '@/components/AppLayout'
import { useAuthStore } from '@/stores/authStore'

interface Program {
  id: string
  name: string
  is_active: boolean
}

interface Props {
  onNavigate: (page: Page) => void
}

// Mock stats for dashboard — real data comes from the graph/courses endpoints
const MOCK_SIMULATIONS = [
  { name: 'Cálculo Diferencial v2.4', date: 'May 10, 2026', performance: 92, status: 'Pasó', statusCls: 'bg-emerald-100 text-emerald-700' },
  { name: 'Estructuras de Datos', date: 'May 8, 2026', performance: 78, status: 'En Revisión', statusCls: 'bg-amber-100 text-amber-700' },
  { name: 'Álgebra Lineal', date: 'May 5, 2026', performance: 45, status: 'Falló', statusCls: 'bg-red-100 text-red-600' },
]

export default function DashboardPage({ onNavigate }: Props) {
  const { user } = useAuthStore()
  const displayName = user?.email?.split('@')[0] ?? 'Estudiante'

  const { data: programs } = useQuery<Program[]>({
    queryKey: ['programs'],
    queryFn: () => api.get('/programs').then((r) => r.data),
  })

  const activePrograms = programs?.filter((p) => p.is_active) ?? []

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
            <p className="text-xs text-white/50 uppercase tracking-wide">Promedio Acumulado (GPA)</p>
            <p className="text-4xl font-bold text-white mt-1">3.85</p>
            <p className="text-xs text-emerald-400 font-medium mt-1 flex items-center gap-1 justify-end">
              <TrendingUp size={11} /> +0.2 este semestre
            </p>
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
          {/* Donut chart placeholder */}
          <div className="flex items-center gap-4">
            <div className="relative w-14 h-14 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#E2E8F0" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke="#6366F1" strokeWidth="3"
                  strokeDasharray="72 28"
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-900">72%</span>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">72%</p>
              <p className="text-xs text-slate-400">Completado</p>
              <p className="text-xs text-slate-400 mt-0.5">108 / 150 créditos</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Programas</p>
            <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center">
              <BookOpen size={14} className="text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">{activePrograms.length}</p>
          <p className="text-xs text-slate-400 mt-1">
            {activePrograms.length === 1 ? 'programa activo' : 'programas activos'}
          </p>
          <div className="flex flex-col gap-1 mt-3">
            {activePrograms.slice(0, 2).map((p) => (
              <span key={p.id} className="text-xs text-slate-600 truncate">• {p.name}</span>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Simulaciones</p>
            <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center">
              <FlaskConical size={14} className="text-amber-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">{MOCK_SIMULATIONS.length}</p>
          <p className="text-xs text-slate-400 mt-1">simulaciones recientes</p>
          <button
            onClick={() => onNavigate('simulation')}
            className="mt-3 flex items-center gap-1.5 text-xs text-indigo-600 font-medium hover:text-indigo-800 transition-colors"
          >
            <Plus size={11} /> Nueva simulación
          </button>
        </div>
      </div>

      {/* Recommended + Recent */}
      <div className="grid grid-cols-2 gap-4">
        {/* Recommended */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Recomendadas para el Próximo Semestre</h3>
            <button
              onClick={() => onNavigate('graph')}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 transition-colors"
            >
              Ver hoja de ruta <ArrowRight size={11} />
            </button>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
              <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-md flex-shrink-0 mt-0.5">
                Prioridad Alta
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-900">Sistemas Distribuidos</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Req: Redes I · 4 créditos</p>
              </div>
              <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-md flex-shrink-0">
                Recomendada
              </span>
            </div>
            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
              <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md flex-shrink-0 mt-0.5">
                Electiva
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-900">Machine Learning</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Req: Álgebra Lineal · 3 créditos</p>
              </div>
              <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md flex-shrink-0">
                Disponible
              </span>
            </div>
          </div>
        </div>

        {/* Recent simulations */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Simulaciones Recientes</h3>
            <button
              onClick={() => onNavigate('simulation')}
              className="flex items-center gap-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus size={11} /> Nueva
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {MOCK_SIMULATIONS.map((sim) => (
              <div key={sim.name} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FlaskConical size={13} className="text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-900 truncate">{sim.name}</p>
                  <p className="text-[10px] text-slate-400">{sim.date}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-16 bg-slate-100 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-indigo-500"
                      style={{ width: `${sim.performance}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-600 w-8 text-right">
                    {sim.performance}%
                  </span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${sim.statusCls}`}>
                    {sim.status}
                  </span>
                  <button className="text-slate-300 hover:text-slate-500 transition-colors">
                    <Eye size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
