import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { env } from '../lib/env'
import { loadOnboardingStatus } from '../services/onboardingService'
import { ErrorState, LoadingState } from './Ui'

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [completed, setCompleted] = useState<boolean | null>(env.demoMode ? true : null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (env.demoMode) return
    void loadOnboardingStatus().then((status) => setCompleted(Boolean(status.completedAt))).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to check organization setup.'))
  }, [])
  if (error) return <main className="centered"><ErrorState message={error} /></main>
  if (completed === null) return <main className="centered"><LoadingState /></main>
  if (!completed && profile?.isSuperAdmin) return <Navigate to="/setup" replace />
  if (!completed) return <main className="centered"><ErrorState message="The organization super admin must finish first-time setup." /></main>
  return children
}
