import { CheckCircle2, Monitor, Users, Building2, ClipboardList } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Button, ErrorState, LoadingState } from '../components/Ui'
import { useAuth } from '../context/AuthContext'
import { getBusinessEmailError, getCompanyNameError, getEmailDomain, isAccountCreationComputer, normalizeCompanyName } from '../domain/accountCreation'
import { env } from '../lib/env'
import { claimShopAccount, completeOrganizationOnboarding, loadOnboardingStatus, signUpShopOwner, type OnboardingStatus } from '../services/onboardingService'
import { AuthFrame } from './AuthPages'

const fallbackTimezones = ['America/Detroit', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'UTC']

function browserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Detroit'
}

function useComputerCheck() {
  const check = () => isAccountCreationComputer(window.innerWidth, window.matchMedia('(any-pointer: fine)').matches)
  const [allowed, setAllowed] = useState(check)
  useEffect(() => {
    const pointer = window.matchMedia('(any-pointer: fine)')
    const update = () => setAllowed(check())
    window.addEventListener('resize', update)
    pointer.addEventListener('change', update)
    return () => { window.removeEventListener('resize', update); pointer.removeEventListener('change', update) }
  }, [])
  return allowed
}

function ComputerRequired({ children }: { children: ReactNode }) {
  const allowed = useComputerCheck()
  if (allowed) return children
  return <AuthFrame title="Continue on a computer" subtitle="The first shop account must be created and configured from a desktop or laptop.">
    <div className="auth-success"><Monitor /><p>Open this page on a computer with a keyboard and mouse or trackpad.</p><Link to="/login">Back to sign in</Link></div>
  </AuthFrame>
}

function TimezoneField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const choices = Array.from(new Set([value, ...fallbackTimezones]))
  return <label>Plant timezone<select value={value} onChange={(event) => onChange(event.target.value)} required>{choices.map((timezone) => <option key={timezone}>{timezone}</option>)}</select></label>
}

export function CreateAccountPage() {
  const { session, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [sentDomain, setSentDomain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (loading) return <main className="centered"><LoadingState /></main>
  if (env.demoMode) return <Navigate to="/login" replace />
  if (profile) return <Navigate to={profile.role === 'customer' ? '/portal' : '/app'} replace />
  if (session) return <Navigate to="/finish-account" replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    const companyNameError = getCompanyNameError(companyName)
    if (companyNameError) { setError(companyNameError); return }
    const emailError = getBusinessEmailError(email)
    if (emailError) { setError(emailError); return }
    if (password.length < 10) { setError('Use a password with at least 10 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    setBusy(true)
    try {
      const data = await signUpShopOwner(email, password, normalizeCompanyName(companyName))
      if (data.session) navigate('/finish-account', { replace: true })
      else setSentDomain(getEmailDomain(email) ?? '')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create the account.')
    } finally { setBusy(false) }
  }

  return <ComputerRequired><AuthFrame title="Create your shop account" subtitle="Use the email of the person who will own ShopCore administration.">
    {sentDomain ? <div className="auth-success"><CheckCircle2 /><h3>Verify your email</h3><p>We sent a confirmation link to your @{sentDomain} address. Open it on this computer to finish setup.</p><Link to="/login">Back to sign in</Link></div> : <form className="auth-form" onSubmit={submit}>
      <label>Company name<input value={companyName} maxLength={160} autoComplete="organization" onChange={(event) => setCompanyName(event.target.value)} required /></label>
      <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label>Password<input type="password" autoComplete="new-password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      <label>Confirm password<input type="password" autoComplete="new-password" minLength={10} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
      <p className="auth-note">Only one ShopCore organization can be created for a company email domain. This first account becomes the protected super admin.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</Button>
      <Link className="auth-link" to="/login">Back to sign in</Link>
    </form>}
  </AuthFrame></ComputerRequired>
}

export function FinishAccountPage() {
  const { session, profile, loading, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [plantTimezone, setPlantTimezone] = useState(browserTimezone)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const metadataPrefilled = useRef(false)

  useEffect(() => {
    if (metadataPrefilled.current || !session) return
    metadataPrefilled.current = true
    const metadataName = session.user.user_metadata.company_name
    if (typeof metadataName === 'string' && !getCompanyNameError(metadataName)) {
      setOrganizationName(normalizeCompanyName(metadataName))
    }
  }, [session])

  if (loading) return <main className="centered"><LoadingState /></main>
  if (!session) return <Navigate to="/login" replace />
  if (profile) return <Navigate to={profile.role === 'customer' ? '/portal' : '/app'} replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await claimShopAccount({ displayName, organizationName, plantTimezone })
      const nextProfile = await refreshProfile()
      if (!nextProfile) throw new Error('The shop was created, but the profile could not be loaded. Sign in again.')
      navigate('/setup', { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create the shop organization.')
    } finally { setBusy(false) }
  }

  return <ComputerRequired><AuthFrame title="Finish your shop account" subtitle={`Verified as ${session.user.email ?? 'your company email'}.`}>
    <form className="auth-form" onSubmit={submit}>
      <label>Your name<input value={displayName} maxLength={120} autoComplete="name" onChange={(event) => setDisplayName(event.target.value)} required /></label>
      <label>Confirm company name<input value={organizationName} maxLength={160} autoComplete="organization" onChange={(event) => setOrganizationName(event.target.value)} required /></label>
      <TimezoneField value={plantTimezone} onChange={setPlantTimezone} />
      <p className="auth-note">This company name—not the email domain—will claim the tenant. Minor capitalization and spacing differences count as the same name.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button disabled={busy}>{busy ? 'Creating shop…' : 'Create shop and continue'}</Button>
      <button className="auth-text-button" type="button" onClick={() => void signOut()}>Use a different account</button>
    </form>
  </AuthFrame></ComputerRequired>
}

export function SetupPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState<OnboardingStatus | null>(null)
  const [organizationName, setOrganizationName] = useState('')
  const [plantTimezone, setPlantTimezone] = useState(browserTimezone)
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void loadOnboardingStatus().then((result) => {
      setStatus(result); setOrganizationName(result.organizationName); setPlantTimezone(result.plantTimezone)
      if (result.completedAt) navigate('/app', { replace: true })
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load setup.'))
  }, [navigate])

  if (!profile || profile.role !== 'manufacturer') return <Navigate to="/login" replace />
  if (!profile.isSuperAdmin) return <main className="centered"><ErrorState message="The organization super admin must finish first-time setup." /></main>
  if (!status && !error) return <main className="centered"><LoadingState /></main>

  const complete = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try { await completeOrganizationOnboarding({ organizationName, plantTimezone }); setStep(3) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to complete setup.') }
    finally { setBusy(false) }
  }

  return <ComputerRequired><main className="setup-page"><section className="setup-card">
    <div className="setup-progress" aria-label={`Setup step ${step} of 3`}><span className={step >= 1 ? 'active' : ''}>1</span><i /><span className={step >= 2 ? 'active' : ''}>2</span><i /><span className={step >= 3 ? 'active' : ''}>3</span></div>
    {step === 1 && <><div className="setup-icon"><Building2 /></div><h1>Welcome to ShopCore</h1><p>This short setup confirms the details used for plant dates, records, and user access.</p><Button onClick={() => setStep(2)}>Start setup</Button></>}
    {step === 2 && <><h1>Confirm your shop</h1><p>The company claim <strong>{status?.accountClaimName}</strong> is reserved for this tenant. The verified owner email is from @{status?.accountEmailDomain}.</p><form className="auth-form" onSubmit={complete}><label>Display company name<input value={organizationName} maxLength={160} onChange={(event) => setOrganizationName(event.target.value)} required /></label><TimezoneField value={plantTimezone} onChange={setPlantTimezone} />{error && <p className="form-error" role="alert">{error}</p>}<Button disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</Button></form></>}
    {step === 3 && <><CheckCircle2 className="setup-complete-icon" /><h1>Your shop is ready</h1><p>Add your team and customers, or start with the first accepted sales order.</p><div className="setup-actions"><Link to="/app/users"><Users />Add plant users</Link><Link to="/app/customers"><Building2 />Add customers</Link><Link to="/app/sales-orders"><ClipboardList />Add a sales order</Link></div><Button onClick={() => navigate('/app', { replace: true })}>Go to dashboard</Button></>}
  </section></main></ComputerRequired>
}
