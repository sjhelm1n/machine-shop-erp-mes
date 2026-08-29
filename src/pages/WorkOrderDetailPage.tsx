import { Archive, ArchiveRestore, ArrowLeft, CalendarDays, Download, ExternalLink, FileStack, GripVertical, Package, Pencil, Plus, QrCode, Trash2, TriangleAlert } from 'lucide-react'
import { useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Button, EmptyState, Modal, PageHeader, ProgressBar } from '../components/Ui'
import { ToolingEditor } from '../components/ToolingEditor'
import { useShop } from '../context/ShopContext'
import { calculateStepMetrics, getNextStep, workOrderProgress } from '../domain/routing'
import { moveRoutingDraft } from '../domain/routingOrder'
import type { ToolingDraft } from '../domain/tooling'
import { formatDate, formatDateTime } from '../lib/format'

interface WorkOrderRoutingDraft {
  key: string
  name: string
  customerStageName: string
  instructions: string
  isNew: boolean
}

export function WorkOrderDetailPage() {
  const { workOrderId } = useParams()
  const { data, addProductionAdjustment, editWorkOrder, saveWorkOrderOperationTools, setWorkOrderArchived } = useShop()
  const [adjustmentOpen, setAdjustmentOpen] = useState(false)
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('')
  const [adjustmentError, setAdjustmentError] = useState('')
  const [adjustmentBusy, setAdjustmentBusy] = useState(false)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [archiveError, setArchiveError] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorBusy, setEditorBusy] = useState(false)
  const [editorError, setEditorError] = useState('')
  const [editForm, setEditForm] = useState({ dueDate: '', notes: '' })
  const [routingDraft, setRoutingDraft] = useState<WorkOrderRoutingDraft[]>([])
  const [draggedRouteKey, setDraggedRouteKey] = useState<string | null>(null)
  const [routeDropKey, setRouteDropKey] = useState<string | null>(null)
  const [toolingOperationId, setToolingOperationId] = useState<string | null>(null)
  const [toolingDraft, setToolingDraft] = useState<ToolingDraft[]>([])
  const [toolingBusy, setToolingBusy] = useState(false)
  const [toolingError, setToolingError] = useState('')
  const workOrder = data?.workOrders.find((candidate) => candidate.id === workOrderId)
  const order = data?.salesOrders.find((candidate) => candidate.id === workOrder?.salesOrderId)
  if (!data || !workOrder || !order) return <main className="page"><EmptyState title="Work order not found" body="Check the link or return to work orders." /></main>
  const metrics = calculateStepMetrics(workOrder, data.productionEvents)
  const enteredRouteIds = new Set(metrics.filter((metric) => metric.enteredAt).map((metric) => metric.stepId))
  const progress = workOrderProgress(workOrder, data.productionEvents)
  const quantityExitedFinalStep = (metrics.at(-1)?.transferred ?? 0) > 0
  const canAddRoutingSteps = !workOrder.completionDate && !quantityExitedFinalStep
  const downloadTraveler = async () => {
    const { generateTravelerPdf } = await import('../services/travelerPdf')
    await generateTravelerPdf(workOrder, order)
  }
  const toggleArchive = async (archived: boolean) => {
    if (archived && !window.confirm('Archive this work order? Production entry will be locked until it is restored.')) return
    setArchiveBusy(true)
    setArchiveError('')
    try { await setWorkOrderArchived(workOrder.id, archived) }
    catch (reason) { setArchiveError(reason instanceof Error ? reason.message : 'Unable to update the work order.') }
    finally { setArchiveBusy(false) }
  }
  const openEditor = () => {
    setEditForm({ dueDate: workOrder.dueDate, notes: workOrder.notes })
    setRoutingDraft(workOrder.routing.map((step) => ({ key: step.id, name: step.routingStepName, customerStageName: step.customerStageName, instructions: step.workInstructions, isNew: false })))
    setDraggedRouteKey(null)
    setRouteDropKey(null)
    setEditorError('')
    setEditorOpen(true)
  }
  const addRoutingStep = () => {
    setRoutingDraft((current) => [...current, { key: crypto.randomUUID(), name: '', customerStageName: 'In production', instructions: '', isNew: true }])
  }
  const moveRouteByOffset = (key: string, offset: -1 | 1) => {
    setRoutingDraft((current) => {
      const currentIndex = current.findIndex((step) => step.key === key)
      const firstEditableIndex = current.findIndex((step) => !enteredRouteIds.has(step.key))
      const targetIndex = currentIndex + offset
      if (currentIndex < 0 || enteredRouteIds.has(key) || targetIndex < Math.max(0, firstEditableIndex)) return current
      return moveRoutingDraft(current, key, targetIndex)
    })
  }
  const startRouteDrag = (event: DragEvent<HTMLButtonElement>, key: string) => {
    if (enteredRouteIds.has(key)) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', key)
    setDraggedRouteKey(key)
  }
  const dropRoute = (event: DragEvent<HTMLDivElement>, targetKey: string) => {
    if (enteredRouteIds.has(targetKey)) return
    event.preventDefault()
    const sourceKey = draggedRouteKey ?? event.dataTransfer.getData('text/plain')
    if (!enteredRouteIds.has(sourceKey)) setRoutingDraft((current) => moveRoutingDraft(current, sourceKey, current.findIndex((step) => step.key === targetKey)))
    setDraggedRouteKey(null)
    setRouteDropKey(null)
  }
  const handleRouteOrderKey = (event: KeyboardEvent<HTMLButtonElement>, key: string) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    moveRouteByOffset(key, event.key === 'ArrowUp' ? -1 : 1)
  }
  const submitEdit = async (event: FormEvent) => {
    event.preventDefault()
    setEditorBusy(true)
    setEditorError('')
    try {
      await editWorkOrder({ workOrderId: workOrder.id, dueDate: editForm.dueDate, notes: editForm.notes, routing: routingDraft.map((step) => ({ id: step.key, name: step.name, customerStageName: step.customerStageName, instructions: step.instructions })) })
      setEditorOpen(false)
    } catch (reason) {
      setEditorError(reason instanceof Error ? reason.message : 'Unable to update the work order.')
    } finally {
      setEditorBusy(false)
    }
  }
  const openToolingEditor = (operationId: string) => {
    setToolingOperationId(operationId)
    setToolingDraft((workOrder.operationTooling ?? [])
      .filter((tool) => tool.workOrderOperationId === operationId)
      .sort((left, right) => left.sequenceNumber - right.sequenceNumber)
      .map((tool) => ({ key: tool.id, toolAssemblyId: tool.toolAssemblyId, toolNumber: tool.toolNumber, notes: tool.notes, sourceRoutingOperationToolId: tool.sourceRoutingOperationToolId })))
    setToolingError('')
  }
  const submitTooling = async (event: FormEvent) => {
    event.preventDefault()
    if (!toolingOperationId) return
    setToolingBusy(true)
    setToolingError('')
    try {
      await saveWorkOrderOperationTools(toolingOperationId, toolingDraft)
      setToolingOperationId(null)
    } catch (reason) {
      setToolingError(reason instanceof Error ? reason.message : 'Unable to update operation tooling.')
    } finally {
      setToolingBusy(false)
    }
  }
  return <main className="page detail-page">
    <Link className="back-link" to="/app/work-orders"><ArrowLeft size={16} /> Back to work orders</Link>
    <PageHeader eyebrow={`Sales order ${order.salesOrderName} · PO ${order.customerPoNumber}`} title={workOrder.workOrderName} description={`${workOrder.partNumber} · ${order.customerName}`} action={<>{workOrder.archivedAt && <Badge>Archived</Badge>}<Button variant="secondary" onClick={() => void downloadTraveler()}><Download size={17} /> Traveler PDF</Button>{!workOrder.archivedAt && <Button variant="secondary" onClick={openEditor}><Pencil size={16} /> Edit work order</Button>}<Button variant="secondary" disabled={archiveBusy} onClick={() => void toggleArchive(!workOrder.archivedAt)}>{workOrder.archivedAt ? <ArchiveRestore size={16} /> : <Archive size={16} />}{archiveBusy ? 'Saving…' : workOrder.archivedAt ? 'Restore work order' : 'Archive work order'}</Button>{!workOrder.archivedAt && <Link className="button button-primary" to={`/produce/${workOrder.id}/${workOrder.routing[0]?.id}`}><QrCode size={17} /> Production view</Link>}</>} />
    {archiveError && <p className="form-error">{archiveError}</p>}
    {workOrder.archivedAt && <div className="notice-card"><strong>Archived work order</strong><p>Production entry is locked. The routing, traveler, and immutable event history remain available for reference.</p></div>}
    <section className="wo-meta-grid"><div><Package /><span>Order quantity</span><strong>{workOrder.quantityOrdered} pieces</strong></div><div><CalendarDays /><span>Due date</span><strong>{formatDate(workOrder.dueDate)}</strong></div><div><FileStack /><span>Sales order</span><strong>{order.salesOrderName}</strong></div><div><span className="metric-percent">{progress}%</span><span>Production progress</span><ProgressBar value={progress} label={false} /></div></section>
    {workOrder.notes && <div className="notice-card"><strong>Traveler notes</strong><p>{workOrder.notes}</p></div>}
    <section className="panel routing-panel"><div className="panel-header"><div><span className="eyebrow">Digital routing</span><h2>Production movement</h2></div><div className="panel-actions"><span className="subtle">Quantities derive from immutable events</span>{!workOrder.archivedAt && <Button variant="secondary" onClick={() => setAdjustmentOpen(true)}>Record overrun</Button>}</div></div>
      <div className={`route-timeline${workOrder.archivedAt ? '' : ' active-work-order'}`}>{workOrder.routing.map((step, index) => {
        const metric = metrics.find((candidate) => candidate.stepId === step.id)!
        const next = getNextStep(step, workOrder.routing)
        const operationTooling = (workOrder.operationTooling ?? []).filter((tool) => tool.workOrderOperationId === step.id).sort((left, right) => left.sequenceNumber - right.sequenceNumber)
        const uncheckedTooling = operationTooling.filter((tool) => data.toolAssemblies.find((assembly) => assembly.id === tool.toolAssemblyId)?.quantityCheckedOut === 0)
        return <article className={`route-step ${metric.completedAt ? 'complete' : metric.entered > 0 ? 'active' : ''}`} key={step.id}>
          <div className="route-marker"><span>{metric.completedAt ? '✓' : step.sequenceNumber}</span>{index < workOrder.routing.length - 1 && <i />}</div>
          <div className="route-content"><header><div><span className="eyebrow">Step {step.sequenceNumber}</span><h3>{step.routingStepName}</h3></div>{!workOrder.archivedAt && <Link to={`/produce/${workOrder.id}/${step.id}`} className="small-action">Open station <ExternalLink size={14} /></Link>}</header>
            <p>{step.workInstructions}</p>
            <div className="quantity-strip"><div><span>Entered</span><strong>{metric.entered}</strong></div><div><span>Transferred</span><strong>{metric.transferred}</strong></div><div><span>Scrap</span><strong>{metric.scrapped}</strong></div><div className="available"><span>Available</span><strong>{metric.available}</strong></div><div><span>Next</span><strong>{next?.routingStepName ?? 'Complete'}</strong></div></div>
            <div className="timestamp-row"><span>Entered <strong>{formatDateTime(metric.enteredAt, data.organization.plantTimezone)}</strong></span><span>Started <strong>{formatDateTime(metric.startedAt, data.organization.plantTimezone)}</strong></span><span>Completed <strong>{formatDateTime(metric.completedAt, data.organization.plantTimezone)}</strong></span></div>
            <section className="operation-tooling"><header><h4>Tooling</h4>{!workOrder.archivedAt && <Button variant="secondary" onClick={() => openToolingEditor(step.id)}><Pencil size={14} /> Edit tooling</Button>}</header>
              {uncheckedTooling.length > 0 ? <div className="operation-tooling-warning"><TriangleAlert size={17} /><div><strong>Checkout required before production</strong><p>Scan the Tool Assembly QR label to check out {uncheckedTooling.map((tool) => `${tool.toolAssemblyNumber} · ${tool.toolAssemblyName}`).join(', ')}.</p></div></div> : null}
              {operationTooling.length === 0 ? <p className="subtle">No tooling assigned.</p> : <div className="operation-tooling-list">{operationTooling.map((tool) => <div className="operation-tooling-row" key={tool.id}><strong>{tool.toolNumber}</strong><span>{tool.toolAssemblyNumber}</span><span><b>{tool.toolAssemblyName}</b>{tool.toolAssemblyDescription ? <small><strong>Assembly description:</strong> {tool.toolAssemblyDescription}</small> : null}{tool.notes ? <small><strong>Operation note:</strong> {tool.notes}</small> : null}</span></div>)}</div>}
            </section>
          </div>
        </article>
      })}</div>
    </section>
    {editorOpen && <Modal title="Edit work order" onClose={() => !editorBusy && setEditorOpen(false)}><form className="entity-form work-order-edit-form" onSubmit={submitEdit}>
      <label>Due date<input type="date" value={editForm.dueDate} onChange={(event) => setEditForm((current) => ({ ...current, dueDate: event.target.value }))} required /></label>
      <label className="full">Traveler notes<textarea value={editForm.notes} onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes printed on the traveler" /></label>
      <div className="form-section full"><header><div><strong>Work order routing</strong><span id="work-order-routing-order-help">Drag unentered operations to reorder them. Arrow keys also work on the drag handle.</span></div><Button type="button" variant="secondary" disabled={!canAddRoutingSteps || routingDraft.length >= 100} title={!canAddRoutingSteps ? 'New steps cannot be added after quantity has exited the current final step' : undefined} onClick={addRoutingStep}><Plus size={15} /> Add step</Button></header>
        {routingDraft.map((step, index) => {
          const locked = enteredRouteIds.has(step.key)
          return <div className={`route-editor work-order-route-editor${locked ? ' locked' : ''}${draggedRouteKey === step.key ? ' dragging' : ''}${routeDropKey === step.key && draggedRouteKey !== step.key ? ' drop-target' : ''}`} key={step.key} onDragOver={(event) => { if (locked) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setRouteDropKey(step.key) }} onDrop={(event) => dropRoute(event, step.key)}>
            <button type="button" className="route-drag-handle" draggable={!locked} disabled={locked} aria-label={`Reorder ${step.name || `step ${index + 1}`}`} aria-describedby="work-order-routing-order-help" title={locked ? 'This step has received quantity and its position is locked' : 'Drag to reorder; use Up or Down arrow keys for keyboard control'} onDragStart={(event) => startRouteDrag(event, step.key)} onDragEnd={() => { setDraggedRouteKey(null); setRouteDropKey(null) }} onKeyDown={(event) => handleRouteOrderKey(event, step.key)}><GripVertical size={17} /></button>
            <span className="route-sequence">{(index + 1) * 10}</span>
            <label>Internal step<input maxLength={120} disabled={locked} value={step.name} onChange={(event) => setRoutingDraft((current) => current.map((candidate) => candidate.key === step.key ? { ...candidate, name: event.target.value } : candidate))} required /></label>
            <label>Customer stage<input maxLength={120} disabled={locked} value={step.customerStageName} onChange={(event) => setRoutingDraft((current) => current.map((candidate) => candidate.key === step.key ? { ...candidate, customerStageName: event.target.value } : candidate))} required /></label>
            <label className="instruction-field">Work instructions<textarea disabled={locked} value={step.instructions} onChange={(event) => setRoutingDraft((current) => current.map((candidate) => candidate.key === step.key ? { ...candidate, instructions: event.target.value } : candidate))} /></label>
            <div className="route-edit-state">{step.isNew ? <button type="button" className="icon-button" aria-label={`Remove ${step.name || `new step ${(index + 1) * 10}`}`} onClick={() => setRoutingDraft((current) => current.filter((candidate) => candidate.key !== step.key))}><Trash2 size={16} /></button> : <Badge tone={locked ? 'neutral' : 'blue'}>{locked ? 'Entered · locked' : 'Not entered'}</Badge>}</div>
          </div>
        })}
      </div>
      {!canAddRoutingSteps && <p className="subtle full">New routing steps are locked because quantity has already exited the current final step. Existing steps that have not been entered can still be edited.</p>}
      {editorError && <p className="form-error full">{editorError}</p>}
      <div className="form-actions full"><Button type="button" variant="ghost" disabled={editorBusy} onClick={() => setEditorOpen(false)}>Cancel</Button><Button disabled={editorBusy}>{editorBusy ? 'Saving…' : 'Save changes'}</Button></div>
    </form></Modal>}
    {toolingOperationId && <Modal title={`Tooling · OP ${workOrder.routing.find((step) => step.id === toolingOperationId)?.sequenceNumber ?? ''}`} onClose={() => !toolingBusy && setToolingOperationId(null)}><form className="entity-form tooling-operation-form" onSubmit={submitTooling}>
      <div className="full"><ToolingEditor idPrefix={`work-order-${toolingOperationId}`} rows={toolingDraft} toolAssemblies={data.toolAssemblies} onChange={setToolingDraft} disabled={toolingBusy} /></div>
      <p className="subtle full">These assignments apply only to this work order. Routing template defaults will not be changed.</p>
      {toolingError && <p className="form-error full">{toolingError}</p>}
      <div className="form-actions full"><Button type="button" variant="ghost" disabled={toolingBusy} onClick={() => setToolingOperationId(null)}>Cancel</Button><Button disabled={toolingBusy}>{toolingBusy ? 'Saving…' : 'Save tooling'}</Button></div>
    </form></Modal>}
    {adjustmentOpen && <Modal title="Add overrun quantity" onClose={() => setAdjustmentOpen(false)}><form className="quantity-modal" onSubmit={async (event: FormEvent) => { event.preventDefault(); setAdjustmentBusy(true); setAdjustmentError(''); try { await addProductionAdjustment({ workOrderId: workOrder.id, routingStepId: workOrder.routing[0].id, quantity: Number(adjustmentQuantity) }); setAdjustmentOpen(false); setAdjustmentQuantity('') } catch (reason) { setAdjustmentError(reason instanceof Error ? reason.message : 'Unable to record overrun.') } finally { setAdjustmentBusy(false) } }}><label>Additional pieces<input autoFocus inputMode="numeric" pattern="[0-9]*" value={adjustmentQuantity} onChange={(event) => setAdjustmentQuantity(event.target.value.replace(/\D/g, ''))} placeholder="0" /></label><p className="subtle">Adds available quantity to the first routing step without changing the accepted order quantity.</p>{adjustmentError && <p className="form-error">{adjustmentError}</p>}<div className="modal-actions"><Button type="button" variant="ghost" onClick={() => setAdjustmentOpen(false)}>Cancel</Button><Button disabled={adjustmentBusy}>{adjustmentBusy ? 'Saving…' : 'Add quantity'}</Button></div></form></Modal>}
  </main>
}
