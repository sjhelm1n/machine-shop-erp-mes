import { Building2, Mail, Search, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Badge, Button, EmptyState, LoadingState, Modal, PageHeader } from '../components/Ui'
import { useAuth } from '../context/AuthContext'
import { useShop } from '../context/ShopContext'
import type { AppRole } from '../domain/types'
import { emailMatchesDomain, normalizedEmail, type ManageableCustomer, type ManagedUser } from '../domain/userManagement'
import { env } from '../lib/env'
import { inviteManagedUser, loadManagedUsers, removeManagedUser } from '../services/userService'

type UserGroup = 'manufacturer' | 'customer'

const demoUsers: ManagedUser[] = [
  { id: 'demo-manufacturer', organizationId: '10000000-0000-0000-0000-000000000001', customerId: null, email: 'jamie@shopcore-demo.com', displayName: 'Jamie Chen', position: null, role: 'manufacturer', isSuperAdmin: true, invitedAt: null, activatedAt: '2026-08-01T12:00:00Z' },
  { id: 'demo-shop-staff', organizationId: '10000000-0000-0000-0000-000000000001', customerId: null, email: 'alex@shopcore-demo.com', displayName: 'Alex Rivera', position: null, role: 'manufacturer', isSuperAdmin: false, invitedAt: '2026-08-20T12:00:00Z', activatedAt: '2026-08-20T13:00:00Z' },
  { id: 'demo-customer', organizationId: '10000000-0000-0000-0000-000000000001', customerId: '20000000-0000-0000-0000-000000000001', email: 'morgan@acmemotion.com', displayName: 'Morgan Lee', position: 'Purchasing Manager', role: 'customer', isSuperAdmin: false, invitedAt: '2026-08-21T12:00:00Z', activatedAt: '2026-08-21T13:00:00Z' },
  { id: 'demo-acme-invited', organizationId: '10000000-0000-0000-0000-000000000001', customerId: '20000000-0000-0000-0000-000000000001', email: 'taylor@acmemotion.com', displayName: 'Taylor Brooks', position: 'Quality Engineer', role: 'customer', isSuperAdmin: false, invitedAt: '2026-08-27T12:00:00Z', activatedAt: null },
]

function customerOptions(dataCustomers: NonNullable<ReturnType<typeof useShop>['data']>['customers']): ManageableCustomer[] {
  return dataCustomers.map((customer) => ({ id: customer.id, customerName: customer.customerName, emailDomain: customer.emailDomain }))
}
export function UsersPage() {
  const { profile } = useAuth()
  const { data } = useShop()
  const [users, setUsers] = useState<ManagedUser[]>(() => env.demoMode ? demoUsers : [])
  const [customers, setCustomers] = useState<ManageableCustomer[]>(() => env.demoMode ? customerOptions(data?.customers ?? []) : [])
  const [group, setGroup] = useState<UserGroup>(profile?.role === 'customer' ? 'customer' : 'manufacturer')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(!env.demoMode)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [form, setForm] = useState({ displayName: '', email: '', position: '', role: (profile?.role === 'customer' ? 'customer' : 'manufacturer') as AppRole, customerId: profile?.customerId ?? '' })

  const refresh = useCallback(async () => {
    if (env.demoMode) return
    setLoading(true)
    try {
      const loaded = await loadManagedUsers()
      setUsers(loaded.users)
      setCustomers(loaded.customers)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load users.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const customerNameById = useMemo(() => new Map(customers.map((customer) => [customer.id, customer.customerName])), [customers])
  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return users.filter((user) => {
      if (profile?.role === 'manufacturer' && user.role !== group) return false
      if (profile?.role === 'customer' && user.customerId !== profile.customerId) return false
      if (!normalizedQuery) return true
      return user.displayName.toLowerCase().includes(normalizedQuery) || user.email.includes(normalizedQuery) || (customerNameById.get(user.customerId ?? '') ?? '').toLowerCase().includes(normalizedQuery)
    })
  }, [customerNameById, group, profile, query, users])

  const selectedCustomer = customers.find((customer) => customer.id === form.customerId)
  const openInvite = () => {
    const role = profile?.role === 'customer' ? 'customer' : group
    const customerId = profile?.role === 'customer' ? profile.customerId ?? '' : role === 'customer' ? customers[0]?.id ?? '' : ''
    setForm({ displayName: '', email: '', position: '', role, customerId })
    setError('')
    setNotice('')
    setOpen(true)
  }

  const submitInvite = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const email = normalizedEmail(form.email)
      const displayName = form.displayName.trim()
      const position = form.role === 'customer' ? form.position.trim() : null
      if (!displayName) throw new Error('Enter the person’s name.')
      if (form.role === 'customer' && !position) throw new Error('Enter the customer representative’s position.')
      const customerId = form.role === 'customer' ? form.customerId || null : null
      const customer = form.role === 'customer' ? customers.find((candidate) => candidate.id === customerId) : null
      if (form.role === 'customer') {
        if (!customer) throw new Error('Choose a customer account.')
        if (!customer.emailDomain) throw new Error('Set this customer’s portal email domain on the Customers page first.')
        if (!emailMatchesDomain(email, customer.emailDomain)) throw new Error(`Email must end in @${customer.emailDomain}.`)
      }

      if (env.demoMode) {
        setUsers((current) => [...current, { id: crypto.randomUUID(), organizationId: profile?.organizationId ?? '', customerId, email, displayName, position, role: form.role, isSuperAdmin: false, invitedAt: new Date().toISOString(), activatedAt: null }])
      } else {
        await inviteManagedUser({ email, displayName, position, role: form.role, customerId })
        await refresh()
      }
      setOpen(false)
      setNotice(`Invitation sent to ${email}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to invite this user.')
    } finally {
      setBusy(false)
    }
  }

  const removeUser = async (user: ManagedUser) => {
    if (!window.confirm(`Remove ${user.displayName} from ShopCore? They will lose access to this ${user.role === 'manufacturer' ? 'ERP' : 'customer portal'}.`)) return
    setRemovingId(user.id)
    setError('')
    setNotice('')
    try {
      if (env.demoMode) setUsers((current) => current.filter((candidate) => candidate.id !== user.id))
      else {
        const result = await removeManagedUser(user.id)
        await refresh()
        if (result.authCleanupPending) setNotice('Access was removed. Supabase Auth account cleanup is pending.')
      }
      setNotice((current) => current || `${user.displayName} no longer has access.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to remove this user.')
    } finally {
      setRemovingId(null)
    }
  }

  const customerPortal = profile?.role === 'customer'
  return <main className="page">
    <PageHeader eyebrow={customerPortal ? 'Customer account' : 'Access control'} title="Users" description={customerPortal ? 'Manage the people at your company who can view this customer portal.' : 'Invite plant staff to the ERP and customer personnel to their company portal.'} action={<Button onClick={openInvite}><UserPlus size={17} /> Add user</Button>} />
    {profile?.role === 'manufacturer' && <div className="segmented user-groups" aria-label="User type"><button className={group === 'manufacturer' ? 'active' : ''} onClick={() => setGroup('manufacturer')}><ShieldCheck size={15} /> Plant staff</button><button className={group === 'customer' ? 'active' : ''} onClick={() => setGroup('customer')}><Building2 size={15} /> Customer portal</button></div>}
    <div className="toolbar"><label className="search-field"><Search size={18} /><input aria-label="Search users" placeholder="Search users…" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
    {notice && <p className="form-notice" role="status">{notice}</p>}
    {error && !open && <p className="form-error" role="alert">{error}</p>}
    {loading ? <LoadingState /> : visibleUsers.length === 0 ? <EmptyState title="No users found" body={query ? 'Try clearing your search.' : 'Invite the first person to this access group.'} /> : <section className="user-access-list" aria-label="Users">
      {visibleUsers.map((user) => <article className="user-access-row" key={user.id}>
        <div className="user-access-avatar"><Users size={18} /></div>
        <div className="user-access-identity"><strong>{user.displayName}</strong><span><Mail size={13} /> {user.email}</span>{profile?.role === 'manufacturer' && user.role === 'customer' && <small>{user.position ?? 'Position not provided'}</small>}</div>
        <div className="user-access-scope"><span>{user.role === 'manufacturer' ? 'Plant staff' : customerNameById.get(user.customerId ?? '') ?? 'Customer portal'}</span>{user.isSuperAdmin && <Badge tone="blue">Super admin</Badge>}<Badge tone={user.activatedAt ? 'green' : 'amber'}>{user.activatedAt ? 'Active' : 'Invitation sent'}</Badge></div>
        <Button variant="danger" disabled={user.isSuperAdmin || user.id === profile?.id || removingId === user.id} title={user.isSuperAdmin ? 'The plant super admin cannot be removed.' : user.id === profile?.id ? 'You cannot remove your own access.' : undefined} onClick={() => void removeUser(user)}><Trash2 size={15} /> {removingId === user.id ? 'Removing…' : 'Remove'}</Button>
      </article>)}
    </section>}
    {open && <Modal title={form.role === 'manufacturer' ? 'Add plant staff' : 'Add portal user'} onClose={() => !busy && setOpen(false)}><form className="entity-form" onSubmit={submitInvite}>
      {profile?.role === 'manufacturer' && <label className="full">Access type<select value={form.role} onChange={(event) => { const role = event.target.value as AppRole; setForm((current) => ({ ...current, role, customerId: role === 'customer' ? current.customerId || customers[0]?.id || '' : '' })) }}><option value="manufacturer">Plant staff — ERP access</option><option value="customer">Customer personnel — portal access</option></select></label>}
      {form.role === 'customer' && profile?.role === 'manufacturer' && <label className="full">Customer<select value={form.customerId} onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))} required><option value="">Choose customer…</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.customerName}{customer.emailDomain ? ` — @${customer.emailDomain}` : ' — domain not set'}</option>)}</select></label>}
      {form.role === 'customer' && <div className="domain-rule full"><Mail size={17} /><div><strong>Company email required</strong><span>{selectedCustomer?.emailDomain ? `Only @${selectedCustomer.emailDomain} addresses can be invited.` : 'Set the portal email domain on the customer record before inviting users.'}</span></div></div>}
      <label className="full">Name<input autoComplete="name" maxLength={120} value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} required /></label>
      {form.role === 'customer' && <label className="full">Position<input maxLength={120} value={form.position} onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))} placeholder="Purchasing Manager" required /></label>}
      <label className="full">Email<input type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" maxLength={254} value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required /></label>
      {error && <p className="form-error full" role="alert">{error}</p>}
      <div className="form-actions full"><Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy || (form.role === 'customer' && !selectedCustomer?.emailDomain)}>{busy ? 'Sending…' : 'Send invitation'}</Button></div>
    </form></Modal>}
  </main>
}
