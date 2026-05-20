import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session, User } from '@supabase/supabase-js'

export interface DbUser {
  id: string
  email: string | null
  role: 'admin' | 'student'
  is_onboarded: boolean
}

interface AuthState {
  user: User | null
  session: Session | null
  dbUser: DbUser | null
  setSession: (session: Session | null) => void
  setDbUser: (dbUser: DbUser | null) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      session: null,
      dbUser: null,
      setSession: (session) => set({ session, user: session?.user ?? null }),
      setDbUser: (dbUser) => set({ dbUser }),
      clear: () => set({ session: null, user: null, dbUser: null }),
    }),
    { name: 'maia-auth' },
  ),
)
