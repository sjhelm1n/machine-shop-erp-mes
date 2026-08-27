import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { env } from '../lib/env'
import { supabase } from '../lib/supabase'
import { Button } from '../components/Ui'

export function LoginPage() {
  const { profile, signIn } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (env.demoMode || profile) return <Navigate to={profile?.role === 'customer' ? '/portal' : '/app'} replace />
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try { await signIn(email, password); navigate((location.state as { from?: string } | null)?.from ?? '/app') }
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
    </form>
  </AuthFrame>
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const submit = async (event: FormEvent) => { event.preventDefault(); if (supabase) await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/confirm?next=/update-password` }); setSent(true) }
  return <AuthFrame title="Reset your password" subtitle="We’ll send recovery instructions if that account exists.">
    {sent ? <div className="auth-success"><CheckCircle2 /><h3>Check your email</h3><p>If an account exists, a recovery link is on its way.</p><Link to="/login">Back to sign in</Link></div> : <form onSubmit={submit} className="auth-form"><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><Button>Send recovery email</Button></form>}
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
    if (!supabase || !tokenHash || !type) { setError('This recovery link is invalid or incomplete.'); return }
    void supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as 'recovery' }).then(({ error: authError }) => authError ? setError(authError.message) : navigate(next, { replace: true }))
  }, [navigate, params])
  return <AuthFrame title="Verifying link" subtitle={error || 'One moment while we confirm your recovery request.'}>{error && <Link to="/forgot-password">Request a new link</Link>}</AuthFrame>
}

export function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); if (password.length < 10) { setError('Use at least 10 characters.'); return } const result = await supabase?.auth.updateUser({ password }); if (result?.error) setError(result.error.message); else setDone(true) }
  return <AuthFrame title="Choose a new password" subtitle="Use a strong password unique to this application.">{done ? <div className="auth-success"><CheckCircle2 /><p>Password updated.</p><Link to="/login">Continue to sign in</Link></div> : <form onSubmit={submit} className="auth-form"><label>New password<input type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p className="form-error">{error}</p>}<Button>Update password</Button></form>}</AuthFrame>
}

function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <main className="auth-page"><div className="auth-brand"><img className="auth-logo" src="/brand/shopcore-mark.png" alt="" aria-hidden="true" /><strong>ShopCore ERP</strong><span>Lightweight shop operations</span></div><section className="auth-card"><h1>{title}</h1><p>{subtitle}</p>{children}</section><footer>Paper communicates the work. Digital captures the flow.</footer></main>
}
