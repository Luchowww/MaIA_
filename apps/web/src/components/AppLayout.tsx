import {
  LayoutDashboard,
  Network,
  FlaskConical,
  MessageSquare,
  Settings,
  GraduationCap,
  Bell,
  Search,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

export type Page = 'dashboard' | 'graph' | 'simulation' | 'chat' | 'settings'

interface Props {
  currentPage: Page
  onNavigate: (page: Page) => void
  children: React.ReactNode
  pageTitle: string
}

const NAV_ITEMS: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'graph', label: 'Curriculum Graph', icon: Network },
  { id: 'simulation', label: 'Simulation Lab', icon: FlaskConical },
  { id: 'chat', label: 'AI Chat', icon: MessageSquare },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function AppLayout({ currentPage, onNavigate, children, pageTitle }: Props) {
  const { user } = useAuthStore()

  const displayName = user?.email?.split('@')[0] ?? 'Usuario'

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-100">
      {/* Sidebar */}
      <aside className="flex flex-col w-[220px] min-w-[220px] bg-white border-r border-slate-200 h-full">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
              <GraduationCap size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 leading-none">EduPortal</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Academic Management</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = currentPage === id
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium w-full text-left transition-colors ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            )
          })}
        </nav>

        {/* Academic Advisor CTA */}
        <div className="px-3 pb-4">
          <button
            onClick={() => onNavigate('chat')}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
          >
            <MessageSquare size={14} />
            Academic Advisor
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center gap-4 px-6 py-3.5 bg-white border-b border-slate-200 flex-shrink-0">
          <h1 className="text-base font-semibold text-slate-900 mr-auto">{pageTitle}</h1>

          {/* Search */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 w-52">
            <Search size={13} className="text-slate-400 flex-shrink-0" />
            <input
              type="text"
              placeholder="Buscar materias..."
              className="bg-transparent text-xs text-slate-600 placeholder-slate-400 outline-none w-full"
            />
          </div>

          {/* Bell */}
          <button className="relative p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
            <Bell size={18} />
          </button>

          {/* Avatar */}
          <button
            onClick={() => onNavigate('settings')}
            title="Cuenta"
            className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-semibold hover:bg-indigo-700 transition-colors uppercase"
          >
            {displayName.slice(0, 2)}
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
