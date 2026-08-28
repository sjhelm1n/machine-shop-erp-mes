import { Mail, MapPin, Pencil, Plus, Search, Users } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Button, EmptyState, Modal, PageHeader } from '../components/Ui'
import { useShop } from '../context/ShopContext'
import type { Customer } from '../domain/types'

const emptyCustomerForm = { customerName: '', logoUrl: '', primaryAddress: '', shipToAddress: '', billToAddress: '' }

function CustomerLogo({ customer }: { customer: Customer }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (!customer.logoUrl || failedUrl === customer.logoUrl) return <div className="customer-icon"><Users size={21} /></div>
  return <div className="customer-logo"><img src={customer.logoUrl} alt={`${customer.customerName} logo`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(customer.logoUrl)} /></div>
}

export function CustomersPage() {
  const { data, addCustomer, editCustomer } = useShop()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyCustomerForm)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const customers = useMemo(() => data?.customers.filter((customer) => customer.customerName.toLowerCase().includes(query.toLowerCase())) ?? [], [data, query])
  const openCreate = () => { setEditingCustomerId(null); setForm(emptyCustomerForm); setError(''); setOpen(true) }
  const openEdit = (customer: Customer) => { setEditingCustomerId(customer.id); setForm({ customerName: customer.customerName, logoUrl: customer.logoUrl ?? '', primaryAddress: customer.primaryAddress, shipToAddress: customer.defaultShipToAddress, billToAddress: customer.defaultBillToAddress }); setError(''); setOpen(true) }
  const closeModal = () => { setOpen(false); setEditingCustomerId(null); setError('') }
  return <main className="page">
    <PageHeader eyebrow="Customer master" title="Customers" description="Portal access and order history stay connected to each account." action={<Button onClick={openCreate}><Plus size={17} /> New customer</Button>} />
    <div className="toolbar"><label className="search-field"><Search size={18} /><input aria-label="Search customers" placeholder="Search customers…" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
    {customers.length === 0 ? <EmptyState title="No customers found" body="Try clearing your search." /> : <section className="customer-grid">{customers.map((customer) => {
      const orders = data?.salesOrders.filter((order) => order.customerId === customer.id) ?? []
      return <article className="customer-card" key={customer.id}><header><CustomerLogo customer={customer} /><button type="button" className="icon-button" aria-label={`Edit ${customer.customerName}`} onClick={() => openEdit(customer)}><Pencil size={16} /></button></header><h2>{customer.customerName}</h2><p><MapPin size={15} /> <span>{customer.primaryAddress.split('\n').join(', ')}</span></p><p><Mail size={15} /> <span>Portal users managed in Supabase Auth</span></p><footer><span><strong>{orders.length}</strong> orders</span><span><strong>{orders.filter((order) => data?.workOrders.some((workOrder) => workOrder.salesOrderId === order.id && !workOrder.completionDate)).length}</strong> open</span></footer></article>
    })}</section>}
    {open && data && <Modal title={editingCustomerId ? 'Edit customer' : 'New customer'} onClose={closeModal}><form className="entity-form" onSubmit={async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { const input = { organizationId: data.organization.id, ...form }; if (editingCustomerId) await editCustomer(editingCustomerId, input); else await addCustomer(input); closeModal(); setForm(emptyCustomerForm) } catch (reason) { setError(reason instanceof Error ? reason.message : `Unable to ${editingCustomerId ? 'update' : 'create'} customer.`) } finally { setBusy(false) } }}>
      <label className="full">Customer name<input value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} required /></label>
      <label className="full">Logo image URL (optional)<input type="url" inputMode="url" pattern="https://.*" maxLength={2048} value={form.logoUrl} onChange={(event) => setForm({ ...form, logoUrl: event.target.value })} placeholder="https://example.com/customer-logo.png" /><span className="field-help">Use a direct HTTPS image URL. The logo scales to fit without cropping.</span></label>
      <label className="full">Primary address<textarea value={form.primaryAddress} onChange={(event) => setForm({ ...form, primaryAddress: event.target.value })} required /></label>
      <label>Default ship-to<textarea value={form.shipToAddress} onChange={(event) => setForm({ ...form, shipToAddress: event.target.value })} /></label>
      <label>Default bill-to<textarea value={form.billToAddress} onChange={(event) => setForm({ ...form, billToAddress: event.target.value })} /></label>
      {error && <p className="form-error full">{error}</p>}<div className="form-actions full"><Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button><Button disabled={busy}>{busy ? 'Saving…' : editingCustomerId ? 'Save customer' : 'Create customer'}</Button></div>
    </form></Modal>}
  </main>
}
