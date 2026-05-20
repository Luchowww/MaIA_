import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { LogOut, User, Shield } from 'lucide-react'

export default function SettingsPage() {
  const { user } = useAuthStore()

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex flex-col gap-4">
        {/* Account card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <User size={16} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900">Cuenta</h3>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-slate-400 font-medium uppercase tracking-wide block mb-1">Email</label>
              <p className="text-sm text-slate-700">{user?.email}</p>
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium uppercase tracking-wide block mb-1">ID Usuario</label>
              <p className="text-xs text-slate-400 font-mono">{user?.id}</p>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <Shield size={16} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900">Seguridad</h3>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
          >
            <LogOut size={15} />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
