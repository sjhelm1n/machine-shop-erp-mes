import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { env } from '../lib/env'
import { supabase } from '../lib/supabase'
import type { AppRole, Profile } from '../domain/types'
import { activateCurrentProfile } from '../services/userService'

interface AuthValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  demoRole: AppRole
  setDemoRole: (role: AppRole) => void
  signIn: (email: string, password: string) => Promise<Profile | null>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<Profile | null>
}

const AuthContext = createContext<AuthValue | null>(null)

const demoProfiles: Record<AppRole, Profile> = {
  manufacturer: { id: 'demo-manufacturer', organizationId: '10000000-0000-0000-0000-000000000001', customerId: null, displayName: 'Jamie Chen', role: 'manufacturer', isSuperAdmin: true },
  customer: { id: 'demo-customer', organizationId: '10000000-0000-0000-0000-000000000001', customerId: '20000000-0000-0000-0000-000000000001', displayName: 'Morgan Lee', role: 'customer', isSuperAdmin: false },
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(env.demoMode ? demoProfiles.manufacturer : null)
  const [loading, setLoading] = useState(!env.demoMode)
  const [demoRole, setDemoRoleState] = useState<AppRole>('manufacturer')

  const fetchProfile = useCallback(async (nextSession: Session | null) => {
    if (!nextSession || !supabase) return null
    const { data, error } = await supabase.from('profiles').select('id, organization_id, customer_id, display_name, role, is_super_admin').eq('id', nextSession.user.id).maybeSingle()
    if (error || !data) return null
    void activateCurrentProfile().catch(() => undefined)
    return { id: data.id, organizationId: data.organization_id, customerId: data.customer_id, displayName: data.display_name, role: data.role, isSuperAdmin: data.is_super_admin } satisfies Profile
  }, [])

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
      const nextProfile = await fetchProfile(nextSession)
      if (!active) return
      setProfile(nextProfile)
      setLoading(false)
    }
    void client.auth.getSession().then(({ data }) => hydrate(data.session))
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => { void hydrate(nextSession) })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [fetchProfile])

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
      if (!supabase) return profile
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      setSession(data.session)
      const nextProfile = await fetchProfile(data.session)
      setProfile(nextProfile)
      return nextProfile
    },
    signOut: async () => {
      if (supabase) await supabase.auth.signOut()
    },
    refreshProfile: async () => {
      if (env.demoMode) return profile
      const nextProfile = await fetchProfile(session)
      setProfile(nextProfile)
      return nextProfile
    },
  }), [session, profile, loading, demoRole, fetchProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
