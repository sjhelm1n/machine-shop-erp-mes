import { Mail, MapPin, Plus, Search, Users } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Button, EmptyState, Modal, PageHeader } from '../components/Ui'
import { useShop } from '../context/ShopContext'

export function CustomersPage() {
  const { data, addCustomer } = useShop()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ customerName: '', primaryAddress: '', shipToAddress: '', billToAddress: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const customers = useMemo(() => data?.customers.filter((customer) => customer.customerName.toLowerCase().includes(query.toLowerCase())) ?? [], [data, query])
  return <main className="page">
    <PageHeader eyebrow="Customer master" title="Customers" description="Portal access and order history stay connected to each account." action={<Button onClick={() => setOpen(true)}><Plus size={17} /> New customer</Button>} />
    <div className="toolbar"><label className="search-field"><Search size={18} /><input aria-label="Search customers" placeholder="Search customers…" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
    {customers.length === 0 ? <EmptyState title="No customers found" body="Try clearing your search." /> : <section className="customer-grid">{customers.map((customer) => {
      const orders = data?.salesOrders.filter((order) => order.customerId === customer.id) ?? []
      return <article className="customer-card" key={customer.id}><header><div className="customer-icon"><Users size={21} /></div></header><h2>{customer.customerName}</h2><p><MapPin size={15} /> <span>{customer.primaryAddress.split('\n').join(', ')}</span></p><p><Mail size={15} /> <span>Portal users managed in Supabase Auth</span></p><footer><span><strong>{orders.length}</strong> orders</span><span><strong>{orders.filter((order) => data?.workOrders.some((workOrder) => workOrder.salesOrderId === order.id && !workOrder.completionDate)).length}</strong> open</span></footer></article>
    })}</section>}
    {open && data && <Modal title="New customer" onClose={() => setOpen(false)}><form className="entity-form" onSubmit={async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { await addCustomer({ organizationId: data.organization.id, ...form }); setOpen(false); setForm({ customerName: '', primaryAddress: '', shipToAddress: '', billToAddress: '' }) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create customer.') } finally { setBusy(false) } }}>
      <label className="full">Customer name<input value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} required /></label>
      <label className="full">Primary address<textarea value={form.primaryAddress} onChange={(event) => setForm({ ...form, primaryAddress: event.target.value })} required /></label>
      <label>Default ship-to<textarea value={form.shipToAddress} onChange={(event) => setForm({ ...form, shipToAddress: event.target.value })} /></label>
      <label>Default bill-to<textarea value={form.billToAddress} onChange={(event) => setForm({ ...form, billToAddress: event.target.value })} /></label>
      {error && <p className="form-error full">{error}</p>}<div className="form-actions full"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy}>{busy ? 'Creating…' : 'Create customer'}</Button></div>
    </form></Modal>}
  </main>
}
