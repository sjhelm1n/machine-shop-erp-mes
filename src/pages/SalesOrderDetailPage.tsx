import { Archive, ArchiveRestore, ArrowLeft, Building2, CalendarDays, CheckCircle2, Circle, FileText, GripVertical, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Button, EmptyState, Modal, PageHeader, ProgressBar } from '../components/Ui'
import { ToolingEditor } from '../components/ToolingEditor'
import { useShop } from '../context/ShopContext'
import { customerStage, salesOrderCompletion, salesOrderProgress, workOrderProgress } from '../domain/routing'
import { moveRoutingDraft } from '../domain/routingOrder'
import type { ToolingDraft } from '../domain/tooling'
import { formatDate, formatDateTime, money } from '../lib/format'
import { useAuth } from '../context/AuthContext'

interface WorkOrderRoutingDraft {
  key: string
  name: string
  stage: string
  instructions: string
  tooling: ToolingDraft[]
}

const blankRoutingStep = (): WorkOrderRoutingDraft => ({ key: crypto.randomUUID(), name: '', stage: 'In production', instructions: '', tooling: [] })

const copyTemplateStep = (step: NonNullable<ReturnType<typeof useShop>['data']>['routingTemplates'][number]['steps'][number]): WorkOrderRoutingDraft => ({
  key: crypto.randomUUID(),
  name: step.routingStepName,
  stage: step.customerStageName,
  instructions: step.workInstructions,
  tooling: (step.tooling ?? []).map((tool) => ({ key: tool.id, toolAssemblyId: tool.toolAssemblyId, toolNumber: tool.toolNumber, notes: tool.notes, sourceRoutingOperationToolId: tool.id })),
})

export function SalesOrderDetailPage() {
  const { orderId } = useParams()
  const { data, addSalesOrderLine, addWorkOrder, editSalesOrderLine, markOrderMilestone, setSalesOrderArchived, setSalesOrderLineArchived } = useShop()
  const { profile } = useAuth()
  const [lineItemOpen, setLineItemOpen] = useState(false)
  const [lineItemBusy, setLineItemBusy] = useState(false)
  const [lineItemError, setLineItemError] = useState('')
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [lineActionBusy, setLineActionBusy] = useState<string | null>(null)
  const [lineActionError, setLineActionError] = useState('')
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [archiveError, setArchiveError] = useState('')
  const [lineItemForm, setLineItemForm] = useState<{ partNumber: string; description: string; manufacturedItem: boolean; pricingType: 'per_piece' | 'flat_rate'; quantity: string; amount: string }>({ partNumber: '', description: '', manufacturedItem: true, pricingType: 'per_piece', quantity: '1', amount: '' })
  const [workOrderOpen, setWorkOrderOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [milestoneBusy, setMilestoneBusy] = useState<'shipped' | 'invoiced' | null>(null)
  const [milestoneError, setMilestoneError] = useState('')
  const [draggedRouteKey, setDraggedRouteKey] = useState<string | null>(null)
  const [routeDropKey, setRouteDropKey] = useState<string | null>(null)
  const manufacturedLines = data?.salesOrders.find((candidate) => candidate.id === orderId)?.lines.filter((line) => line.manufacturedItem && !line.archivedAt) ?? []
  const [workOrderForm, setWorkOrderForm] = useState({ workOrderName: '', lineId: '', quantity: '', dueDate: '', notes: '', routingTemplateId: '' })
  const [routing, setRouting] = useState<WorkOrderRoutingDraft[]>([blankRoutingStep()])
  const order = data?.salesOrders.find((candidate) => candidate.id === orderId)
  if (!data || !order) return <main className="page"><EmptyState title="Order not found" body="It may have been removed or you may not have access." /></main>
  const workOrders = data.workOrders.filter((workOrder) => workOrder.salesOrderId === order.id)
  const routingTemplates = data.routingTemplates.filter((template) => !template.archivedAt)
  const activeLines = order.lines.filter((line) => !line.archivedAt)
  const editingLineLinked = editingLineId ? workOrders.some((workOrder) => workOrder.salesOrderLineItemId === editingLineId) : false
  const progress = salesOrderProgress(data.workOrders, data.productionEvents, order.id)
  const completion = salesOrderCompletion(order, data.workOrders, data.productionEvents)
  const back = profile?.role === 'customer' ? '/portal' : '/app/sales-orders'
  const openLineItemForm = () => {
    setEditingLineId(null)
    setLineItemForm({ partNumber: '', description: '', manufacturedItem: true, pricingType: 'per_piece', quantity: '1', amount: '' })
    setLineItemError('')
    setLineItemOpen(true)
  }
  const openLineItemEditor = (lineId: string) => {
    const line = order.lines.find((candidate) => candidate.id === lineId)
    if (!line || line.archivedAt) return
    setEditingLineId(line.id)
    setLineItemForm({ partNumber: line.partNumber ?? '', description: line.description, manufacturedItem: line.manufacturedItem, pricingType: line.pricingType, quantity: String(line.quantity), amount: String(line.pricingType === 'per_piece' ? line.unitPrice ?? 0 : line.flatRateAmount ?? 0) })
    setLineItemError('')
    setLineItemOpen(true)
  }
  const submitLineItem = async (event: FormEvent) => {
    event.preventDefault()
    const quantity = Number(lineItemForm.quantity)
    const amount = Number(lineItemForm.amount)
    if (!Number.isInteger(quantity) || quantity <= 0) return setLineItemError('Enter a whole quantity greater than zero.')
    if (!Number.isFinite(amount) || amount < 0) return setLineItemError('Enter an amount of zero or greater.')
    setLineItemBusy(true)
    setLineItemError('')
    try {
      const input = {
        partNumber: lineItemForm.partNumber.trim() || null,
        description: lineItemForm.description.trim(),
        manufacturedItem: lineItemForm.manufacturedItem,
        pricingType: lineItemForm.pricingType,
        quantity,
        unitPrice: lineItemForm.pricingType === 'per_piece' ? amount : null,
        flatRateAmount: lineItemForm.pricingType === 'flat_rate' ? amount : null,
      }
      if (editingLineId) await editSalesOrderLine(editingLineId, input)
      else await addSalesOrderLine(order.id, input)
      setLineItemOpen(false)
    } catch (reason) {
      setLineItemError(reason instanceof Error ? reason.message : 'Unable to add the line item.')
    } finally {
      setLineItemBusy(false)
    }
  }
  const toggleLineArchive = async (lineId: string, archived: boolean) => {
    if (archived && !window.confirm('Archive this sales order line? Its history will be preserved and it can be restored later.')) return
    setLineActionBusy(lineId)
    setLineActionError('')
    try { await setSalesOrderLineArchived(lineId, archived) }
    catch (reason) { setLineActionError(reason instanceof Error ? reason.message : 'Unable to update the line item.') }
    finally { setLineActionBusy(null) }
  }
  const toggleOrderArchive = async (archived: boolean) => {
    if (archived && !window.confirm('Archive this sales order? It will move out of active lists and can be restored later.')) return
    setArchiveBusy(true)
    setArchiveError('')
    try { await setSalesOrderArchived(order.id, archived) }
    catch (reason) { setArchiveError(reason instanceof Error ? reason.message : 'Unable to update the sales order.') }
    finally { setArchiveBusy(false) }
  }
  const markMilestone = async (milestone: 'shipped' | 'invoiced') => {
    setMilestoneBusy(milestone)
    setMilestoneError('')
    try { await markOrderMilestone(order.id, milestone) }
    catch (reason) { setMilestoneError(reason instanceof Error ? reason.message : 'Unable to update the order.') }
    finally { setMilestoneBusy(null) }
  }
  const moveRouteByOffset = (key: string, offset: -1 | 1) => {
    setRouting((current) => {
      const currentIndex = current.findIndex((step) => step.key === key)
      return moveRoutingDraft(current, key, currentIndex + offset)
    })
  }
  const startRouteDrag = (event: DragEvent<HTMLButtonElement>, key: string) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', key)
    setDraggedRouteKey(key)
  }
  const dropRoute = (event: DragEvent<HTMLDivElement>, targetKey: string) => {
    event.preventDefault()
    const sourceKey = draggedRouteKey ?? event.dataTransfer.getData('text/plain')
    setRouting((current) => moveRoutingDraft(current, sourceKey, current.findIndex((step) => step.key === targetKey)))
    setDraggedRouteKey(null)
    setRouteDropKey(null)
  }
  const handleRouteOrderKey = (event: KeyboardEvent<HTMLButtonElement>, key: string) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    moveRouteByOffset(key, event.key === 'ArrowUp' ? -1 : 1)
  }
  const loadRoutingTemplate = (templateId: string) => {
    const template = routingTemplates.find((candidate) => candidate.id === templateId)
    setWorkOrderForm((current) => ({ ...current, routingTemplateId: templateId }))
    if (template) setRouting(template.steps.map(copyTemplateStep))
    else setRouting([blankRoutingStep()])
  }
  const openWorkOrderForm = () => {
    const line = manufacturedLines[0]
    const template = routingTemplates[0]
    setWorkOrderForm({ workOrderName: '', lineId: line?.id ?? '', quantity: String(line?.quantity ?? ''), dueDate: order.orderDueDate, notes: '', routingTemplateId: template?.id ?? '' })
    setRouting(template ? template.steps.map(copyTemplateStep) : [blankRoutingStep()])
    setError('')
    setWorkOrderOpen(true)
  }
  return <main className="page detail-page">
    <Link className="back-link" to={back}><ArrowLeft size={16} /> Back to orders</Link>
    <PageHeader eyebrow={`Customer PO ${order.customerPoNumber}`} title={order.salesOrderName} description={order.customerName} action={<>{order.archivedAt ? <Badge>Archived</Badge> : <Badge tone={completion.completed ? 'green' : 'blue'}>{completion.completed ? 'Complete' : 'Open'}</Badge>}{profile?.role === 'manufacturer' && <Button variant="secondary" disabled={archiveBusy} onClick={() => void toggleOrderArchive(!order.archivedAt)}>{order.archivedAt ? <ArchiveRestore size={16} /> : <Archive size={16} />}{archiveBusy ? 'Saving…' : order.archivedAt ? 'Restore order' : 'Archive order'}</Button>}</>} />
    {archiveError && <p className="form-error">{archiveError}</p>}
    {order.archivedAt && profile?.role === 'manufacturer' && <div className="notice-card"><strong>Archived sales order</strong><p>This record is read-only in active workflows. Restore it to change line items, fulfillment, or create work orders.</p></div>}
    <section className="order-summary panel"><div><span>Overall production</span><strong>{progress}%</strong></div><ProgressBar value={progress} label={false} /><dl><div><dt><Building2 /> Customer</dt><dd>{order.customerName}</dd></div><div><dt><CalendarDays /> Due date</dt><dd>{formatDate(order.orderDueDate)}</dd></div><div><dt><FileText /> Received</dt><dd>{formatDate(order.dateReceived)}</dd></div>{profile?.role === 'manufacturer' && <div><dt><MapPin /> Ship to</dt><dd>{order.shipToAddress.split('\n').join(', ')}</dd></div>}</dl></section>
    <section className="panel order-lifecycle"><div className="panel-header"><div><span className="eyebrow">Fulfillment</span><h2>Order completion</h2><p>Production, shipping, and invoicing must all be complete.</p></div></div><div className="lifecycle-list">
      <article className={completion.productionCompleted ? 'complete' : ''}><span className="lifecycle-icon">{completion.productionCompleted ? <CheckCircle2 /> : <Circle />}</span><div><strong>Production</strong><small>{completion.productionCompleted ? 'Production is 100% complete' : `${progress}% complete`}</small></div><Badge tone={completion.productionCompleted ? 'green' : 'neutral'}>{completion.productionCompleted ? 'Complete' : 'Pending'}</Badge></article>
      <article className={completion.shipped ? 'complete' : ''}><span className="lifecycle-icon">{completion.shipped ? <CheckCircle2 /> : <Circle />}</span><div><strong>Shipping</strong><small>{order.shippedAt ? `Marked shipped ${formatDateTime(order.shippedAt, data.organization.plantTimezone)}` : 'Shipment has not been confirmed'}</small></div>{completion.shipped ? <Badge tone="green">Complete</Badge> : profile?.role === 'manufacturer' && !order.archivedAt ? <Button variant="secondary" disabled={milestoneBusy !== null} onClick={() => void markMilestone('shipped')}>{milestoneBusy === 'shipped' ? 'Saving…' : 'Mark shipping complete'}</Button> : <Badge>Pending</Badge>}</article>
      <article className={completion.invoiced ? 'complete' : ''}><span className="lifecycle-icon">{completion.invoiced ? <CheckCircle2 /> : <Circle />}</span><div><strong>Invoicing</strong><small>{order.invoicedAt ? `Confirmed ${formatDateTime(order.invoicedAt, data.organization.plantTimezone)}` : 'Customer invoice has not been confirmed'}</small></div>{completion.invoiced ? <Badge tone="green">Complete</Badge> : profile?.role === 'manufacturer' && !order.archivedAt ? <Button variant="secondary" disabled={milestoneBusy !== null} onClick={() => void markMilestone('invoiced')}>{milestoneBusy === 'invoiced' ? 'Saving…' : 'Mark invoicing complete'}</Button> : <Badge>Pending</Badge>}</article>
    </div>{milestoneError && <p className="form-error lifecycle-error">{milestoneError}</p>}</section>
    {profile?.role === 'manufacturer' ? <section className="panel"><div className="panel-header"><div><span className="eyebrow">Commercial</span><h2>Order lines</h2></div><div className="panel-actions">{order.archivedAt ? <span className="subtle">Restore order to make changes</span> : order.invoicedAt ? <span className="subtle">Locked after invoicing</span> : <Button variant="secondary" onClick={openLineItemForm}><Plus size={16} /> Add line item</Button>}</div></div><div className="line-list">{order.lines.map((line) => {
      const linked = workOrders.some((workOrder) => workOrder.salesOrderLineItemId === line.id)
      const archiveDisabled = linked || (!line.archivedAt && activeLines.length <= 1)
      return <div className={`line-row${line.archivedAt ? ' archived-row' : ''}`} key={line.id}><span className="line-number">{line.lineNumber}</span><div><strong>{line.partNumber ?? line.description}</strong><small>{line.archivedAt ? 'Archived line item' : line.partNumber ? line.description : line.pricingType === 'flat_rate' ? 'Flat-rate charge' : ''}</small></div><span>{line.quantity} {line.manufacturedItem ? 'pcs' : ''}</span><span>{line.pricingType === 'per_piece' ? `${money.format(line.unitPrice ?? 0)} ea` : 'Flat rate'}</span><strong>{money.format(line.lineTotal)}</strong><div className="line-row-actions">{!order.archivedAt && !order.invoicedAt && (line.archivedAt ? <button type="button" className="icon-button" aria-label={`Restore line ${line.lineNumber}`} title="Restore line item" disabled={lineActionBusy === line.id} onClick={() => void toggleLineArchive(line.id, false)}><ArchiveRestore size={16} /></button> : <><button type="button" className="icon-button" aria-label={`Edit line ${line.lineNumber}`} title="Edit line item" disabled={lineActionBusy !== null} onClick={() => openLineItemEditor(line.id)}><Pencil size={15} /></button><button type="button" className="icon-button" aria-label={`Archive line ${line.lineNumber}`} title={linked ? 'A linked work order prevents archiving' : activeLines.length <= 1 ? 'At least one active line is required' : 'Archive line item'} disabled={lineActionBusy !== null || archiveDisabled} onClick={() => void toggleLineArchive(line.id, true)}><Archive size={16} /></button></>)}</div></div>
    })}</div>{lineActionError && <p className="form-error line-action-error">{lineActionError}</p>}<div className="order-total"><span>Active order total</span><strong>{money.format(activeLines.reduce((sum, line) => sum + line.lineTotal, 0))}</strong></div></section> : <section className="panel"><div className="panel-header"><div><span className="eyebrow">Accepted items</span><h2>Order lines</h2></div></div><div className="portal-item-list">{activeLines.map((line) => <div key={line.id}><span className="line-number">{line.lineNumber}</span><div><strong>{line.partNumber ?? line.description}</strong>{line.partNumber && <small>{line.description}</small>}</div><span>{line.quantity} {line.manufacturedItem ? 'pieces' : ''}</span></div>)}</div></section>}
    <section className="panel"><div className="panel-header"><div><span className="eyebrow">Production</span><h2>Work orders</h2></div>{profile?.role === 'manufacturer' && !order.archivedAt && !order.invoicedAt && <Button variant="secondary" disabled={manufacturedLines.length === 0} onClick={openWorkOrderForm}><Plus size={16} /> Create work order</Button>}</div>{workOrders.map((workOrder) => {
      const woProgress = workOrderProgress(workOrder, data.productionEvents)
      const destination = profile?.role === 'customer' ? '#' : `/app/work-orders/${workOrder.id}`
      return <Link to={destination} onClick={(event) => destination === '#' && event.preventDefault()} className="linked-work-order" key={workOrder.id}><div><strong>{profile?.role === 'manufacturer' ? workOrder.workOrderName : workOrder.partNumber}</strong><span>{workOrder.partNumber} · {workOrder.quantityOrdered} pieces</span></div><Badge tone={woProgress === 100 ? 'green' : 'blue'}>{customerStage(workOrder, data.productionEvents)}</Badge><div className="linked-progress"><ProgressBar value={woProgress} /></div><span className="linked-due">Due {formatDate(workOrder.dueDate)}</span></Link>
    })}</section>
    {lineItemOpen && profile?.role === 'manufacturer' && !order.invoicedAt && !order.archivedAt && <Modal title={editingLineId ? 'Edit sales order line' : 'Add sales order line'} onClose={() => !lineItemBusy && setLineItemOpen(false)}><form className="entity-form" onSubmit={submitLineItem}>
      <label>Part / item<input autoFocus value={lineItemForm.partNumber} disabled={editingLineLinked} onChange={(event) => setLineItemForm({ ...lineItemForm, partNumber: event.target.value })} required={lineItemForm.manufacturedItem} /></label>
      <label>Description<input value={lineItemForm.description} onChange={(event) => setLineItemForm({ ...lineItemForm, description: event.target.value })} required /></label>
      <label>Pricing<select value={lineItemForm.pricingType} onChange={(event) => setLineItemForm({ ...lineItemForm, pricingType: event.target.value as 'per_piece' | 'flat_rate' })}><option value="per_piece">Per piece</option><option value="flat_rate">Flat rate</option></select></label>
      <label>Quantity<input type="number" min="1" step="1" value={lineItemForm.quantity} onChange={(event) => setLineItemForm({ ...lineItemForm, quantity: event.target.value })} required /></label>
      <label>{lineItemForm.pricingType === 'per_piece' ? 'Unit price' : 'Amount'}<input type="number" min="0" step="0.01" value={lineItemForm.amount} onChange={(event) => setLineItemForm({ ...lineItemForm, amount: event.target.value })} required /></label>
      <label className="check-label"><input type="checkbox" checked={lineItemForm.manufacturedItem} disabled={editingLineLinked} onChange={(event) => setLineItemForm({ ...lineItemForm, manufacturedItem: event.target.checked })} /> Manufactured item</label>
      <p className="subtle full">{editingLineLinked ? 'Part number and manufactured status are locked because this line has a work order. Quantity, description, and pricing can still be corrected.' : editingLineId ? 'Line number and ordering remain unchanged.' : 'The line number is assigned automatically. Manufactured items can be released to a work order after this line is saved.'}</p>
      {lineItemError && <p className="form-error full">{lineItemError}</p>}<div className="form-actions full"><Button type="button" variant="ghost" disabled={lineItemBusy} onClick={() => setLineItemOpen(false)}>Cancel</Button><Button disabled={lineItemBusy}>{lineItemBusy ? 'Saving…' : editingLineId ? 'Save changes' : 'Add line item'}</Button></div>
    </form></Modal>}
    {workOrderOpen && profile?.role === 'manufacturer' && <Modal title="Create and release work order" onClose={() => setWorkOrderOpen(false)}><form className="entity-form work-order-form" onSubmit={async (event: FormEvent) => {
      event.preventDefault(); const line = manufacturedLines.find((candidate) => candidate.id === workOrderForm.lineId); if (!line?.partNumber) return; setBusy(true); setError('')
      try { await addWorkOrder({ organizationId: order.organizationId, workOrderName: workOrderForm.workOrderName, salesOrderId: order.id, salesOrderLineItemId: line.id, partNumber: line.partNumber, quantityOrdered: Number(workOrderForm.quantity), dueDate: workOrderForm.dueDate, notes: workOrderForm.notes, routing: routing.map((step, index) => ({ sequenceNumber: (index + 1) * 10, name: step.name, customerStageName: step.stage, instructions: step.instructions, tooling: step.tooling.map((tool) => ({ sourceRoutingOperationToolId: tool.sourceRoutingOperationToolId ?? null, toolAssemblyId: tool.toolAssemblyId, toolNumber: tool.toolNumber, notes: tool.notes })) })) }); setWorkOrderOpen(false) }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create work order.') } finally { setBusy(false) }
    }}>
      <label>Work order name (optional)<input value={workOrderForm.workOrderName} onChange={(event) => setWorkOrderForm({ ...workOrderForm, workOrderName: event.target.value })} placeholder="Defaults to the generated order name" /></label>
      <label>Manufactured line<select value={workOrderForm.lineId} onChange={(event) => { const line = manufacturedLines.find((candidate) => candidate.id === event.target.value); setWorkOrderForm({ ...workOrderForm, lineId: event.target.value, quantity: String(line?.quantity ?? '') }) }} required>{manufacturedLines.map((line) => <option value={line.id} key={line.id}>{line.partNumber} · line {line.lineNumber}</option>)}</select></label>
      <label>Quantity<input type="number" min="1" step="1" value={workOrderForm.quantity} onChange={(event) => setWorkOrderForm({ ...workOrderForm, quantity: event.target.value })} required /></label>
      <label>Due date<input type="date" value={workOrderForm.dueDate} onChange={(event) => setWorkOrderForm({ ...workOrderForm, dueDate: event.target.value })} required /></label>
      <label className="full">Traveler notes<input value={workOrderForm.notes} onChange={(event) => setWorkOrderForm({ ...workOrderForm, notes: event.target.value })} /></label>
      <label className="full">Routing template<select value={workOrderForm.routingTemplateId} onChange={(event) => loadRoutingTemplate(event.target.value)}><option value="">Custom routing</option>{routingTemplates.map((template) => <option value={template.id} key={template.id}>{template.templateName} · {template.steps.length} steps</option>)}</select></label>
      <p className="subtle full">Selecting a template copies its steps below. Any edits apply only to this new work order and do not change the template.</p>
      <div className="form-section full"><header><div><strong>Routing</strong><span id="routing-order-help">Drag operations to reorder them. Arrow keys also work on the drag handle.</span></div><Button type="button" variant="secondary" onClick={() => setRouting((current) => [...current, blankRoutingStep()])}><Plus size={15} /> Add step</Button></header>{routing.map((step, index) => <div className={`route-editor${draggedRouteKey === step.key ? ' dragging' : ''}${routeDropKey === step.key && draggedRouteKey !== step.key ? ' drop-target' : ''}`} key={step.key} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setRouteDropKey(step.key) }} onDrop={(event) => dropRoute(event, step.key)}><button type="button" className="route-drag-handle" draggable aria-label={`Reorder ${step.name || `step ${index + 1}`}`} aria-describedby="routing-order-help" title="Drag to reorder; use Up or Down arrow keys for keyboard control" onDragStart={(event) => startRouteDrag(event, step.key)} onDragEnd={() => { setDraggedRouteKey(null); setRouteDropKey(null) }} onKeyDown={(event) => handleRouteOrderKey(event, step.key)}><GripVertical size={17} /></button><span className="route-sequence">{(index + 1) * 10}</span><label>Internal step<input value={step.name} onChange={(event) => setRouting((current) => current.map((candidate) => candidate.key === step.key ? { ...candidate, name: event.target.value } : candidate))} required /></label><label>Customer stage<input value={step.stage} onChange={(event) => setRouting((current) => current.map((candidate) => candidate.key === step.key ? { ...candidate, stage: event.target.value } : candidate))} required /></label><label className="instruction-field">Work instructions<textarea value={step.instructions} onChange={(event) => setRouting((current) => current.map((candidate) => candidate.key === step.key ? { ...candidate, instructions: event.target.value } : candidate))} /></label><div className="operation-tooling-editor"><ToolingEditor idPrefix={`work-order-create-${step.key}`} rows={step.tooling} toolAssemblies={data.toolAssemblies} onChange={(tooling) => setRouting((current) => current.map((candidate) => candidate.key === step.key ? { ...candidate, tooling } : candidate))} /></div><button type="button" className="icon-button" aria-label={`Remove ${step.name || `step ${index + 1}`}`} disabled={routing.length === 1} onClick={() => setRouting((current) => current.filter((candidate) => candidate.key !== step.key))}><Trash2 size={16} /></button></div>)}</div>
      {error && <p className="form-error full">{error}</p>}<div className="form-actions full"><Button type="button" variant="ghost" onClick={() => setWorkOrderOpen(false)}>Cancel</Button><Button disabled={busy}>{busy ? 'Releasing…' : 'Create and release'}</Button></div>
    </form></Modal>}
  </main>
}
