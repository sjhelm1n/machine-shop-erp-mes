import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { AppRole } from '../domain/types'
import { env } from '../lib/env'
import { useAuth } from '../context/AuthContext'
import { LoadingState } from './Ui'

export function ProtectedRoute({ role, children }: { role?: AppRole; children: ReactNode }) {
  const { profile, loading } = useAuth()
  const location = useLocation()
  if (loading) return <main className="centered"><LoadingState /></main>
  if (!profile && !env.demoMode) return <Navigate to="/login" state={{ from: `${location.pathname}${location.search}${location.hash}` }} replace />
  if (role && profile?.role !== role) return <Navigate to={profile?.role === 'customer' ? '/portal' : '/app'} replace />
  return children
}
