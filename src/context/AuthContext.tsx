import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { env } from '../lib/env'
import { supabase } from '../lib/supabase'
import type { AppRole, Profile } from '../domain/types'

interface AuthValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  demoRole: AppRole
  setDemoRole: (role: AppRole) => void
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

const demoProfiles: Record<AppRole, Profile> = {
  manufacturer: { id: 'demo-manufacturer', organizationId: '10000000-0000-0000-0000-000000000001', customerId: null, displayName: 'Jamie Chen', role: 'manufacturer' },
  customer: { id: 'demo-customer', organizationId: '10000000-0000-0000-0000-000000000001', customerId: '20000000-0000-0000-0000-000000000001', displayName: 'Morgan Lee', role: 'customer' },
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(env.demoMode ? demoProfiles.manufacturer : null)
  const [loading, setLoading] = useState(!env.demoMode)
  const [demoRole, setDemoRoleState] = useState<AppRole>('manufacturer')

  useEffect(() => {
    const client = supabase
    if (!client) return
    let active = true
    const hydrate = async (nextSession: Session | null) => {
      if (!active) return
      setSession(nextSession)
      if (!nextSession) {
        setProfile(null)
        setLoading(false)
        return
      }
      const { data, error } = await client.from('profiles').select('id, organization_id, customer_id, display_name, role').eq('id', nextSession.user.id).single()
      if (!active) return
      if (error) {
        setProfile(null)
      } else {
        setProfile({ id: data.id, organizationId: data.organization_id, customerId: data.customer_id, displayName: data.display_name, role: data.role })
      }
      setLoading(false)
    }
    void client.auth.getSession().then(({ data }) => hydrate(data.session))
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => { void hydrate(nextSession) })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  const setDemoRole = (role: AppRole) => {
    setDemoRoleState(role)
    if (env.demoMode) setProfile(demoProfiles[role])
  }

  const value = useMemo<AuthValue>(() => ({
    session,
    profile,
    loading,
    demoRole,
    setDemoRole,
    signIn: async (email, password) => {
      if (!supabase) return
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    signOut: async () => {
      if (supabase) await supabase.auth.signOut()
    },
  }), [session, profile, loading, demoRole])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
