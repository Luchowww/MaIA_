import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import AppLayout, { type Page } from '@/components/AppLayout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import GraphPage from '@/pages/GraphPage'
import SimulationPage from '@/pages/SimulationPage'
import ScenariosPage from '@/pages/ScenariosPage'
import ScenarioComparePage from '@/pages/ScenarioComparePage'
import ChatPage from '@/pages/ChatPage'
import SettingsPage from '@/pages/SettingsPage'
import AdminPage from '@/pages/AdminPage'
import OnboardingPage from '@/pages/OnboardingPage'
import ChatWidget from '@/components/chat/ChatWidget'
import { api } from '@/lib/api'

const queryClient = new QueryClient()

const PAGE_TITLES: Record<Page, string> = {
  dashboard: 'Academic Dashboard',
  graph: 'Malla Curricular',
  simulation: 'Simulation Lab',
  scenarios: 'Escenarios de Simulación',
  chat: 'AI Chat',
  settings: 'Settings',
  admin: 'Panel Administrativo',
}

function AppContent() {
  const { session, setSession, clear, dbUser, setDbUser } = useAuthStore()
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [compareIds, setCompareIds] = useState<string[] | null>(null)

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

  // Fetch db user (with role) after session is set
  useEffect(() => {
    if (session && !dbUser) {
      api.get('/auth/me').then((r) => setDbUser(r.data)).catch(() => {})
    }
    if (!session) {
      setDbUser(null)
    }
  }, [session, dbUser, setDbUser])

  if (!session) return <LoginPage />

  const handleNavigate = (page: Page) => {
    setCurrentPage(page)
    setCompareIds(null)
  }

  const handleCompare = (ids: string[]) => {
    setCompareIds(ids)
    setCurrentPage('scenarios')
  }

  // Admin: only admin panel + settings
  if (dbUser?.role === 'admin') {
    const adminPage = currentPage === 'settings' ? 'settings' : 'admin'
    return (
      <AppLayout
        currentPage={adminPage}
        onNavigate={setCurrentPage}
        pageTitle={PAGE_TITLES[adminPage]}
      >
        {adminPage === 'settings' ? <SettingsPage /> : <AdminPage />}
      </AppLayout>
    )
  }

  // Student: show onboarding if not completed yet
  if (dbUser && !dbUser.is_onboarded) {
    return (
      <OnboardingPage
        onComplete={() => {
          setDbUser({ ...dbUser, is_onboarded: true })
          setCurrentPage('dashboard')
        }}
      />
    )
  }

  return (
    <AppLayout
      currentPage={currentPage}
      onNavigate={handleNavigate}
      pageTitle={compareIds ? 'Comparar escenarios' : PAGE_TITLES[currentPage]}
    >
      {currentPage === 'dashboard' && <DashboardPage onNavigate={handleNavigate} />}
      {currentPage === 'graph' && <GraphPage />}
      {currentPage === 'simulation' && <SimulationPage />}
      {currentPage === 'scenarios' && !compareIds && (
        <ScenariosPage onCompare={handleCompare} />
      )}
      {currentPage === 'scenarios' && compareIds && (
        <ScenarioComparePage
          scenarioIds={compareIds}
          onBack={() => setCompareIds(null)}
        />
      )}
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
