import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { isAuthApiError } from '@supabase/supabase-js'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { env } from '../lib/env'
import { supabase } from '../lib/supabase'
import { Button, LoadingState } from '../components/Ui'
import { ACCOUNT_CREATION_HOLD_MS } from '../domain/accountCreation'

export function LoginPage() {
  const { session, profile, loading, signIn } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showCreateAccount, setShowCreateAccount] = useState(false)
  const heldKeys = useRef(new Set<string>())
  const revealTimer = useRef<number | null>(null)

  useEffect(() => {
    const clearTimer = () => {
      if (revealTimer.current !== null) window.clearTimeout(revealTimer.current)
      revealTimer.current = null
    }
    const reset = () => { heldKeys.current.clear(); clearTimer() }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') return
      heldKeys.current.add(event.code)
      if (heldKeys.current.size === 2 && revealTimer.current === null) {
        revealTimer.current = window.setTimeout(() => setShowCreateAccount(true), ACCOUNT_CREATION_HOLD_MS)
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') return
      heldKeys.current.delete(event.code)
      clearTimer()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', reset)
    return () => {
      clearTimer()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', reset)
    }
  }, [])

  if (loading) return <main className="centered"><LoadingState /></main>
  if (session && !profile) return <Navigate to="/finish-account" replace />
  if (env.demoMode || profile) return <Navigate to={profile?.role === 'customer' ? '/portal' : '/app'} replace />
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const nextProfile = await signIn(email, password)
      const fallback = nextProfile?.role === 'customer' ? '/portal' : nextProfile ? '/app' : '/finish-account'
      navigate((location.state as { from?: string } | null)?.from ?? fallback)
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to sign in.') }
    finally { setBusy(false) }
  }
  return <AuthFrame title="Welcome back" subtitle="Sign in to continue to shop operations.">
    <form onSubmit={submit} className="auth-form">
      <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      {error && <p className="form-error">{error}</p>}
      <Button disabled={busy}>{busy ? 'Signing in…' : <>Sign in <ArrowRight size={18} /></>}</Button>
      <Link className="auth-link" to="/forgot-password">Forgot password?</Link>
      {showCreateAccount && <Link className="auth-link auth-create-link" to="/create-account">Create the first account for your shop</Link>}
    </form>
  </AuthFrame>
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) { setError('Password recovery is unavailable in this environment.'); return }
    setBusy(true)
    setError('')
    try {
      const result = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/confirm?next=/update-password` })
      if (result.error) {
        if (isAuthApiError(result.error) && result.error.code === 'over_email_send_rate_limit') {
          setError('Too many recovery emails have been requested. Wait a while before trying again, or ask your administrator for help.')
        } else {
          setError('Unable to send a recovery email right now. Please try again later.')
        }
        return
      }
      setSent(true)
    } catch {
      setError('Unable to send a recovery email right now. Please try again later.')
    } finally {
      setBusy(false)
    }
  }
  return <AuthFrame title="Reset your password" subtitle="We’ll send recovery instructions if that account exists.">
    {sent ? <div className="auth-success"><CheckCircle2 /><h3>Check your email</h3><p>If an account exists, a recovery link is on its way.</p><Link to="/login">Back to sign in</Link></div> : <form onSubmit={submit} className="auth-form"><label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>{error && <p className="form-error" role="alert">{error}</p>}<Button disabled={busy}>{busy ? 'Sending…' : 'Send recovery email'}</Button></form>}
  </AuthFrame>
}

export function AuthConfirmPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  useEffect(() => {
    const tokenHash = params.get('token_hash')
    const type = params.get('type')
    const requested = params.get('next') ?? '/update-password'
    const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/update-password'
    const client = supabase
    if (!client) { setError('Supabase Auth is unavailable.'); return }
    if (tokenHash && (type === 'recovery' || type === 'invite' || type === 'signup')) {
      void client.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error: authError }) => authError ? setError(authError.message) : navigate(next, { replace: true }))
      return
    }
    void client.auth.getSession().then(({ data }) => data.session ? navigate(next, { replace: true }) : setError('This invitation or recovery link is invalid or incomplete.'))
  }, [navigate, params])
  return <AuthFrame title="Verifying link" subtitle={error || 'One moment while we confirm your secure link.'}>{error && <Link to="/login">Back to sign in</Link>}</AuthFrame>
}

export function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); if (password.length < 10) { setError('Use at least 10 characters.'); return } const result = await supabase?.auth.updateUser({ password }); if (result?.error) setError(result.error.message); else setDone(true) }
  return <AuthFrame title="Choose a new password" subtitle="Use a strong password unique to this application.">{done ? <div className="auth-success"><CheckCircle2 /><p>Password updated.</p><Link to="/login">Continue to sign in</Link></div> : <form onSubmit={submit} className="auth-form"><label>New password<input type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p className="form-error">{error}</p>}<Button>Update password</Button></form>}</AuthFrame>
}

export function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <main className="auth-page"><div className="auth-brand"><img className="auth-logo" src="/brand/shopcore-mark.png" alt="" aria-hidden="true" /><strong>ShopCore ERP</strong><span>Lightweight shop operations</span></div><section className="auth-card"><h1>{title}</h1><p>{subtitle}</p>{children}</section><footer>The core, the essentials, of an ERP</footer></main>
}
