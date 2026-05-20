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
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{
        backgroundImage: `url('https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1920&q=80&auto=format&fit=crop')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
      }}
    >
      {/* Overlay con gradiente para mayor legibilidad */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/75 via-slate-900/60 to-indigo-900/70" />

      {/* Contenido centrado */}
      <div className="relative z-10 flex flex-col items-center w-full px-4">

        {/* Logo */}
        <div className="flex flex-col items-center mb-7">
          <div className="w-14 h-14 bg-white/15 backdrop-blur-sm border border-white/20 rounded-2xl flex items-center justify-center mb-3 shadow-lg">
            <GraduationCap size={26} className="text-white" />
          </div>
          <h1 style={{ color: '#ffffff', textShadow: '0 0 24px rgba(99,102,241,0.9), 0 0 8px rgba(99,102,241,0.6)', fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.02em' }}>MaIA</h1>
          <p className="text-sm text-white/70 mt-1">Asistente Académico Inteligente</p>
        </div>

        {/* Card */}
        <div className="w-full max-w-[400px] bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/30 px-8 py-8">

          <h2 className="text-lg font-bold text-slate-900 mb-1 text-center">
            {isRegister ? 'Crear cuenta' : 'Bienvenido de nuevo'}
          </h2>
          <p className="text-sm text-slate-500 mb-6 text-center">
            {isRegister
              ? 'Completa los datos para registrarte'
              : 'Ingresa tus credenciales para continuar'}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                placeholder="tu@universidad.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-2.5 pr-10 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition"
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
                  ? 'bg-blue-50 text-blue-600 border border-blue-100'
                  : 'bg-red-50 text-red-600 border border-red-100'
              }`}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 mt-1 shadow-sm"
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

        <p className="text-xs text-white/40 mt-6">© 2026 MaIA · Academic Intelligence Platform</p>
      </div>
    </div>
  )
}
