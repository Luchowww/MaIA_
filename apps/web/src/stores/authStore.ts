import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session, User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  setSession: (session: Session | null) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      session: null,
      setSession: (session) => set({ session, user: session?.user ?? null }),
      clear: () => set({ session: null, user: null }),
    }),
    { name: 'maia-auth' },
  ),
)
