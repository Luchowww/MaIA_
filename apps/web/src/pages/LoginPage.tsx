import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { GraduationCap, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isRegister, setIsRegister] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const setSession = useAuthStore((s) => s.setSession)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (isRegister) {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setError('Revisa tu correo para confirmar el registro.')
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        setSession(data.session)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex">
      {/* Left: brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] min-w-[380px] bg-slate-900 p-10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
            <GraduationCap size={18} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-none">EduPortal</p>
            <p className="text-[10px] text-white/40 mt-0.5">Academic Management</p>
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-white leading-tight mb-4">
            Tu asistente<br />académico inteligente
          </h1>
          <p className="text-sm text-white/60 leading-relaxed mb-8">
            Visualiza tu malla curricular, simula escenarios académicos y recibe orientación personalizada con IA.
          </p>

          {/* Feature list */}
          <div className="flex flex-col gap-3">
            {[
              { label: 'Malla curricular interactiva', desc: 'Visualiza todas tus materias y prerequisitos' },
              { label: 'Simulador de pérdidas', desc: 'Analiza el impacto de perder una materia' },
              { label: 'Asistente IA', desc: 'Respuestas contextuales sobre tu pensum' },
            ].map((f) => (
              <div key={f.label} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-white">{f.label}</p>
                  <p className="text-[11px] text-white/40">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/30">© 2026 EduPortal · Academic Intelligence Platform</p>
      </div>

      {/* Right: auth form */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 p-8">
        <div className="w-full max-w-[360px]">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center">
              <GraduationCap size={18} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 leading-none">EduPortal</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Academic Management</p>
            </div>
          </div>

          <h2 className="text-xl font-bold text-slate-900 mb-1">
            {isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
          </h2>
          <p className="text-sm text-slate-500 mb-7">
            {isRegister
              ? 'Completa los datos para registrarte'
              : 'Ingresa tus credenciales para continuar'}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                placeholder="tu@universidad.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border border-slate-200 bg-white rounded-xl px-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full border border-slate-200 bg-white rounded-xl px-4 py-2.5 pr-10 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <p className={`text-xs px-3 py-2 rounded-lg ${
                error.includes('correo')
                  ? 'bg-blue-50 text-blue-600'
                  : 'bg-red-50 text-red-600'
              }`}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 mt-1"
            >
              {loading ? 'Cargando...' : isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-5">
            {isRegister ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}{' '}
            <button
              onClick={() => { setIsRegister(!isRegister); setError(null) }}
              className="text-indigo-600 hover:text-indigo-800 font-semibold transition-colors"
            >
              {isRegister ? 'Iniciar sesión' : 'Regístrate'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
