import { ArrowLeft, Building2, CalendarDays, FileText, MapPin, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Button, EmptyState, Modal, PageHeader, ProgressBar } from '../components/Ui'
import { useShop } from '../context/ShopContext'
import { customerStage, salesOrderProgress, workOrderProgress } from '../domain/routing'
import { formatDate, money } from '../lib/format'
import { useAuth } from '../context/AuthContext'

export function SalesOrderDetailPage() {
  const { orderId } = useParams()
  const { data, addWorkOrder } = useShop()
  const { profile } = useAuth()
  const [workOrderOpen, setWorkOrderOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const manufacturedLines = data?.salesOrders.find((candidate) => candidate.id === orderId)?.lines.filter((line) => line.manufacturedItem) ?? []
  const [workOrderForm, setWorkOrderForm] = useState({ workOrderNumber: '', lineId: '', quantity: '', dueDate: '', notes: '' })
  const [routing, setRouting] = useState([
    { key: crypto.randomUUID(), name: 'Saw', stage: 'In production', instructions: '', revision: '' },
    { key: crypto.randomUUID(), name: 'CNC', stage: 'In production', instructions: '', revision: '' },
    { key: crypto.randomUUID(), name: 'Deburr', stage: 'Finishing', instructions: '', revision: '' },
    { key: crypto.randomUUID(), name: 'Final Inspection', stage: 'Inspection', instructions: '', revision: '' },
  ])
  const order = data?.salesOrders.find((candidate) => candidate.id === orderId)
  if (!data || !order) return <main className="page"><EmptyState title="Order not found" body="It may have been removed or you may not have access." /></main>
  const workOrders = data.workOrders.filter((workOrder) => workOrder.salesOrderId === order.id)
  const progress = salesOrderProgress(data.workOrders, data.productionEvents, order.id)
  const orderComplete = workOrders.length > 0 && workOrders.every((workOrder) => workOrder.completionDate !== null)
  const back = profile?.role === 'customer' ? '/portal' : '/app/sales-orders'
  return <main className="page detail-page">
    <Link className="back-link" to={back}><ArrowLeft size={16} /> Back to orders</Link>
    <PageHeader eyebrow={`Customer PO · ${order.customerPoNumber}`} title={order.salesOrderNumber} description={order.customerName} action={<Badge tone={orderComplete ? 'green' : 'blue'}>{orderComplete ? 'Complete' : 'In production'}</Badge>} />
    <section className="order-summary panel"><div><span>Overall production</span><strong>{progress}%</strong></div><ProgressBar value={progress} label={false} /><dl><div><dt><Building2 /> Customer</dt><dd>{order.customerName}</dd></div><div><dt><CalendarDays /> Due date</dt><dd>{formatDate(order.orderDueDate)}</dd></div><div><dt><FileText /> Received</dt><dd>{formatDate(order.dateReceived)}</dd></div>{profile?.role === 'manufacturer' && <div><dt><MapPin /> Ship to</dt><dd>{order.shipToAddress.split('\n').join(', ')}</dd></div>}</dl></section>
    {profile?.role === 'manufacturer' ? <section className="panel"><div className="panel-header"><div><span className="eyebrow">Commercial</span><h2>Order lines</h2></div></div><div className="line-list">{order.lines.map((line) => <div className="line-row" key={line.id}><span className="line-number">{line.lineNumber}</span><div><strong>{line.partNumber ?? line.description}</strong><small>{line.partNumber ? line.description : line.pricingType === 'flat_rate' ? 'Flat-rate charge' : ''}</small></div><span>{line.quantity} {line.manufacturedItem ? 'pcs' : ''}</span><span>{line.pricingType === 'per_piece' ? `${money.format(line.unitPrice ?? 0)} ea` : 'Flat rate'}</span><strong>{money.format(line.lineTotal)}</strong></div>)}</div><div className="order-total"><span>Order total</span><strong>{money.format(order.lines.reduce((sum, line) => sum + line.lineTotal, 0))}</strong></div></section> : <section className="panel"><div className="panel-header"><div><span className="eyebrow">Accepted items</span><h2>Order lines</h2></div></div><div className="portal-item-list">{order.lines.map((line) => <div key={line.id}><span className="line-number">{line.lineNumber}</span><div><strong>{line.partNumber ?? line.description}</strong>{line.partNumber && <small>{line.description}</small>}</div><span>{line.quantity} {line.manufacturedItem ? 'pieces' : ''}</span></div>)}</div></section>}
    <section className="panel"><div className="panel-header"><div><span className="eyebrow">Production</span><h2>Work orders</h2></div>{profile?.role === 'manufacturer' && <Button variant="secondary" onClick={() => { const line = manufacturedLines[0]; setWorkOrderForm({ workOrderNumber: '', lineId: line?.id ?? '', quantity: String(line?.quantity ?? ''), dueDate: order.orderDueDate, notes: '' }); setWorkOrderOpen(true) }}><Plus size={16} /> Create work order</Button>}</div>{workOrders.map((workOrder) => {
      const woProgress = workOrderProgress(workOrder, data.productionEvents)
      const destination = profile?.role === 'customer' ? '#' : `/app/work-orders/${workOrder.id}`
      return <Link to={destination} onClick={(event) => destination === '#' && event.preventDefault()} className="linked-work-order" key={workOrder.id}><div><strong>{profile?.role === 'manufacturer' ? workOrder.workOrderNumber : workOrder.partNumber}</strong><span>{workOrder.partNumber} · {workOrder.quantityOrdered} pieces</span></div><Badge tone={woProgress === 100 ? 'green' : 'blue'}>{customerStage(workOrder, data.productionEvents)}</Badge><div className="linked-progress"><ProgressBar value={woProgress} /></div><span className="linked-due">Due {formatDate(workOrder.dueDate)}</span></Link>
    })}</section>
    {workOrderOpen && profile?.role === 'manufacturer' && <Modal title="Create and release work order" onClose={() => setWorkOrderOpen(false)}><form className="entity-form work-order-form" onSubmit={async (event: FormEvent) => {
      event.preventDefault(); const line = manufacturedLines.find((candidate) => candidate.id === workOrderForm.lineId); if (!line?.partNumber) return; setBusy(true); setError('')
      try { await addWorkOrder({ organizationId: order.organizationId, workOrderNumber: workOrderForm.workOrderNumber, salesOrderId: order.id, salesOrderLineItemId: line.id, partNumber: line.partNumber, quantityOrdered: Number(workOrderForm.quantity), dueDate: workOrderForm.dueDate, notes: workOrderForm.notes, routing: routing.map((step, index) => ({ sequenceNumber: (index + 1) * 10, name: step.name, customerStageName: step.stage, instructions: step.instructions, revision: step.revision || null })) }); setWorkOrderOpen(false) }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create work order.') } finally { setBusy(false) }
    }}>
      <label>Work order #<input value={workOrderForm.workOrderNumber} onChange={(event) => setWorkOrderForm({ ...workOrderForm, workOrderNumber: event.target.value })} placeholder="WO-260832" required /></label>
      <label>Manufactured line<select value={workOrderForm.lineId} onChange={(event) => { const line = manufacturedLines.find((candidate) => candidate.id === event.target.value); setWorkOrderForm({ ...workOrderForm, lineId: event.target.value, quantity: String(line?.quantity ?? '') }) }} required>{manufacturedLines.map((line) => <option value={line.id} key={line.id}>{line.partNumber} · line {line.lineNumber}</option>)}</select></label>
      <label>Quantity<input type="number" min="1" step="1" value={workOrderForm.quantity} onChange={(event) => setWorkOrderForm({ ...workOrderForm, quantity: event.target.value })} required /></label>
      <label>Due date<input type="date" value={workOrderForm.dueDate} onChange={(event) => setWorkOrderForm({ ...workOrderForm, dueDate: event.target.value })} required /></label>
      <label className="full">Traveler notes<input value={workOrderForm.notes} onChange={(event) => setWorkOrderForm({ ...workOrderForm, notes: event.target.value })} /></label>
      <div className="form-section full"><header><div><strong>Routing</strong><span>Each step gets a QR code on the traveler.</span></div><Button type="button" variant="secondary" onClick={() => setRouting([...routing, { key: crypto.randomUUID(), name: '', stage: 'In production', instructions: '', revision: '' }])}><Plus size={15} /> Add step</Button></header>{routing.map((step, index) => <div className="route-editor" key={step.key}><span>{(index + 1) * 10}</span><label>Internal step<input value={step.name} onChange={(event) => setRouting(routing.map((candidate) => candidate.key === step.key ? { ...candidate, name: event.target.value } : candidate))} required /></label><label>Customer stage<input value={step.stage} onChange={(event) => setRouting(routing.map((candidate) => candidate.key === step.key ? { ...candidate, stage: event.target.value } : candidate))} required /></label><label className="instruction-field">Work instructions<textarea value={step.instructions} onChange={(event) => setRouting(routing.map((candidate) => candidate.key === step.key ? { ...candidate, instructions: event.target.value } : candidate))} /></label><label>Revision<input value={step.revision} onChange={(event) => setRouting(routing.map((candidate) => candidate.key === step.key ? { ...candidate, revision: event.target.value } : candidate))} /></label><button type="button" className="icon-button" disabled={routing.length === 1} onClick={() => setRouting(routing.filter((candidate) => candidate.key !== step.key))}><Trash2 size={16} /></button></div>)}</div>
      {error && <p className="form-error full">{error}</p>}<div className="form-actions full"><Button type="button" variant="ghost" onClick={() => setWorkOrderOpen(false)}>Cancel</Button><Button disabled={busy}>{busy ? 'Releasing…' : 'Create and release'}</Button></div>
    </form></Modal>}
  </main>
}
