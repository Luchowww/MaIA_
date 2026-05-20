import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import AppLayout, { type Page } from '@/components/AppLayout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import GraphPage from '@/pages/GraphPage'
import SimulationPage from '@/pages/SimulationPage'
import ChatPage from '@/pages/ChatPage'
import SettingsPage from '@/pages/SettingsPage'
import ChatWidget from '@/components/chat/ChatWidget'

const queryClient = new QueryClient()

const PAGE_TITLES: Record<Page, string> = {
  dashboard: 'Academic Dashboard',
  graph: 'Malla Curricular',
  simulation: 'Simulation Lab',
  chat: 'AI Chat',
  settings: 'Settings',
}

function AppContent() {
  const { session, setSession, clear } = useAuthStore()
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (newSession) {
        setSession(newSession)
      } else {
        clear()
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [setSession, clear])

  if (!session) return <LoginPage />

  return (
    <AppLayout
      currentPage={currentPage}
      onNavigate={setCurrentPage}
      pageTitle={PAGE_TITLES[currentPage]}
    >
      {currentPage === 'dashboard' && <DashboardPage onNavigate={setCurrentPage} />}
      {currentPage === 'graph' && <GraphPage />}
      {currentPage === 'simulation' && <SimulationPage />}
      {currentPage === 'chat' && <ChatPage />}
      {currentPage === 'settings' && <SettingsPage />}

      {currentPage !== 'chat' && <ChatWidget />}
    </AppLayout>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}
