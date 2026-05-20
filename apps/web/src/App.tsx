import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import ChatWidget from '@/components/chat/ChatWidget'

const queryClient = new QueryClient()

function AppContent() {
  const { session, setSession, clear } = useAuthStore()

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
    <>
      <DashboardPage />
      <ChatWidget />
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}
