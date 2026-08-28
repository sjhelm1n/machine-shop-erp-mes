import { Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, EmptyState, Modal, PageHeader, ProgressBar } from '../components/Ui'
import { useShop } from '../context/ShopContext'
import { isSalesOrderCompleted, salesOrderProgress } from '../domain/routing'
import { formatDate, money } from '../lib/format'

export function SalesOrdersPage() {
  const { data, addSalesOrder } = useShop()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'open' | 'completed' | 'all' | 'archived'>('open')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ salesOrderName: '', customerId: '', customerPoNumber: '', dateReceived: new Date().toISOString().slice(0, 10), orderDueDate: '', notes: '' })
  const [lines, setLines] = useState<Array<{ key: string; partNumber: string; description: string; manufacturedItem: boolean; pricingType: 'per_piece' | 'flat_rate'; quantity: string; amount: string }>>([{ key: crypto.randomUUID(), partNumber: '', description: '', manufacturedItem: true, pricingType: 'per_piece', quantity: '1', amount: '' }])
  const orders = useMemo(() => data?.salesOrders.filter((order) => {
    const matchesQuery = [order.salesOrderName, order.customerName, order.customerPoNumber].join(' ').toLowerCase().includes(query.toLowerCase())
    const completed = isSalesOrderCompleted(order, data.workOrders, data.productionEvents)
    const matchesStatus = status === 'archived' ? Boolean(order.archivedAt) : !order.archivedAt && (status === 'all' || (status === 'completed' ? completed : !completed))
    return matchesQuery && matchesStatus
  }) ?? [], [data, query, status])
  return <main className="page">
    <PageHeader eyebrow="Accepted POs" title="Sales orders" description="Commercial details, delivery dates, and linked production." action={<Button onClick={() => setOpen(true)}><Plus size={17} /> New sales order</Button>} />
    <div className="toolbar"><label className="search-field"><Search size={18} /><input aria-label="Search sales orders" placeholder="Search order, customer, or PO…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="segmented"><button className={status === 'open' ? 'active' : ''} onClick={() => setStatus('open')}>Open</button><button className={status === 'completed' ? 'active' : ''} onClick={() => setStatus('completed')}>Completed</button><button className={status === 'all' ? 'active' : ''} onClick={() => setStatus('all')}>All</button><button className={status === 'archived' ? 'active' : ''} onClick={() => setStatus('archived')}>Archived</button></div></div>
    {orders.length === 0 ? <EmptyState title="No sales orders found" body="Try another search or filter." /> : <div className="table-card"><table><thead><tr><th>Sales order name</th><th>Customer / PO</th><th>Received</th><th>Due</th><th>Total</th><th>Production</th></tr></thead><tbody>{orders.map((order) => {
      const activeLines = order.lines.filter((line) => !line.archivedAt)
      const total = activeLines.reduce((sum, line) => sum + line.lineTotal, 0)
      const progress = salesOrderProgress(data?.workOrders ?? [], data?.productionEvents ?? [], order.id)
      return <tr key={order.id}><td><Link className="table-primary" to={`/app/sales-orders/${order.id}`}>{order.salesOrderName}</Link><small>{activeLines.length} active line{activeLines.length === 1 ? '' : 's'}{order.archivedAt ? ' · archived' : ''}</small></td><td><strong>{order.customerName}</strong><small>PO {order.customerPoNumber}</small></td><td>{formatDate(order.dateReceived)}</td><td><Badge tone={new Date(order.orderDueDate) < new Date() && progress < 100 ? 'red' : 'neutral'}>{formatDate(order.orderDueDate)}</Badge></td><td>{money.format(total)}</td><td className="progress-cell"><ProgressBar value={progress} /></td></tr>
    })}</tbody></table></div>}
    {open && data && <Modal title="New accepted sales order" onClose={() => setOpen(false)}><form className="entity-form order-form" onSubmit={async (event: FormEvent) => {
      event.preventDefault(); const customer = data.customers.find((candidate) => candidate.id === form.customerId); if (!customer) return; setBusy(true); setError('')
      try { await addSalesOrder({ organizationId: data.organization.id, salesOrderName: form.salesOrderName, customerId: customer.id, customerName: customer.customerName, customerAddress: customer.primaryAddress, customerPoNumber: form.customerPoNumber, shipToAddress: customer.defaultShipToAddress, billToAddress: customer.defaultBillToAddress, dateReceived: form.dateReceived, orderDueDate: form.orderDueDate, notes: form.notes, lines: lines.map((line, index) => ({ lineNumber: index + 1, partNumber: line.partNumber || null, description: line.description, manufacturedItem: line.manufacturedItem, pricingType: line.pricingType, quantity: Number(line.quantity), unitPrice: line.pricingType === 'per_piece' ? Number(line.amount) : null, flatRateAmount: line.pricingType === 'flat_rate' ? Number(line.amount) : null, sortOrder: (index + 1) * 10 })) }); setOpen(false) }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create sales order.') } finally { setBusy(false) }
    }}>
      <label>Sales order name (optional)<input value={form.salesOrderName} onChange={(event) => setForm({ ...form, salesOrderName: event.target.value })} placeholder="Defaults to the generated order name" /></label>
      <label>Customer<select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })} required><option value="">Choose customer</option>{data.customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.customerName}</option>)}</select></label>
      <label>Customer PO #<input value={form.customerPoNumber} onChange={(event) => setForm({ ...form, customerPoNumber: event.target.value })} required /></label>
      <label>Date received<input type="date" value={form.dateReceived} onChange={(event) => setForm({ ...form, dateReceived: event.target.value })} required /></label>
      <label>Order due date<input type="date" value={form.orderDueDate} onChange={(event) => setForm({ ...form, orderDueDate: event.target.value })} required /></label>
      <label>Notes<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      <div className="form-section full"><header><div><strong>Pricing lines</strong><span>Manufactured lines can create work orders later.</span></div><Button type="button" variant="secondary" onClick={() => setLines([...lines, { key: crypto.randomUUID(), partNumber: '', description: '', manufacturedItem: false, pricingType: 'flat_rate', quantity: '1', amount: '' }])}><Plus size={15} /> Add line</Button></header>
        {lines.map((line, index) => <div className="line-editor" key={line.key}><span>{index + 1}</span><label>Part / item<input value={line.partNumber} onChange={(event) => setLines(lines.map((candidate) => candidate.key === line.key ? { ...candidate, partNumber: event.target.value } : candidate))} required={line.manufacturedItem} /></label><label className="description-field">Description<input value={line.description} onChange={(event) => setLines(lines.map((candidate) => candidate.key === line.key ? { ...candidate, description: event.target.value } : candidate))} required /></label><label>Pricing<select value={line.pricingType} onChange={(event) => setLines(lines.map((candidate) => candidate.key === line.key ? { ...candidate, pricingType: event.target.value as 'per_piece' | 'flat_rate' } : candidate))}><option value="per_piece">Per piece</option><option value="flat_rate">Flat rate</option></select></label><label>Qty<input type="number" min="1" step="1" value={line.quantity} onChange={(event) => setLines(lines.map((candidate) => candidate.key === line.key ? { ...candidate, quantity: event.target.value } : candidate))} required /></label><label>{line.pricingType === 'per_piece' ? 'Unit price' : 'Amount'}<input type="number" min="0" step="0.01" value={line.amount} onChange={(event) => setLines(lines.map((candidate) => candidate.key === line.key ? { ...candidate, amount: event.target.value } : candidate))} required /></label><label className="check-label"><input type="checkbox" checked={line.manufacturedItem} onChange={(event) => setLines(lines.map((candidate) => candidate.key === line.key ? { ...candidate, manufacturedItem: event.target.checked } : candidate))} /> Manufactured</label><button type="button" className="icon-button" disabled={lines.length === 1} onClick={() => setLines(lines.filter((candidate) => candidate.key !== line.key))}><Trash2 size={16} /></button></div>)}
      </div>
      {error && <p className="form-error full">{error}</p>}<div className="form-actions full"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy}>{busy ? 'Creating…' : 'Create sales order'}</Button></div>
    </form></Modal>}
  </main>
}
