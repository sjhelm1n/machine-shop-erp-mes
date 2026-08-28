import { Archive, ArchiveRestore, ArrowLeft, CalendarDays, Download, ExternalLink, FileStack, Package, QrCode } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Button, EmptyState, Modal, PageHeader, ProgressBar } from '../components/Ui'
import { useShop } from '../context/ShopContext'
import { calculateStepMetrics, getNextStep, workOrderProgress } from '../domain/routing'
import { formatDate, formatDateTime } from '../lib/format'

export function WorkOrderDetailPage() {
  const { workOrderId } = useParams()
  const { data, addProductionAdjustment, setWorkOrderArchived } = useShop()
  const [adjustmentOpen, setAdjustmentOpen] = useState(false)
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('')
  const [adjustmentError, setAdjustmentError] = useState('')
  const [adjustmentBusy, setAdjustmentBusy] = useState(false)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [archiveError, setArchiveError] = useState('')
  const workOrder = data?.workOrders.find((candidate) => candidate.id === workOrderId)
  const order = data?.salesOrders.find((candidate) => candidate.id === workOrder?.salesOrderId)
  if (!data || !workOrder || !order) return <main className="page"><EmptyState title="Work order not found" body="Check the link or return to work orders." /></main>
  const metrics = calculateStepMetrics(workOrder, data.productionEvents)
  const progress = workOrderProgress(workOrder, data.productionEvents)
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
  return <main className="page detail-page">
    <Link className="back-link" to="/app/work-orders"><ArrowLeft size={16} /> Back to work orders</Link>
    <PageHeader eyebrow={`Sales order ${order.salesOrderName} · PO ${order.customerPoNumber}`} title={workOrder.workOrderName} description={`${workOrder.partNumber} · ${order.customerName}`} action={<>{workOrder.archivedAt && <Badge>Archived</Badge>}<Button variant="secondary" onClick={() => void downloadTraveler()}><Download size={17} /> Traveler PDF</Button><Button variant="secondary" disabled={archiveBusy} onClick={() => void toggleArchive(!workOrder.archivedAt)}>{workOrder.archivedAt ? <ArchiveRestore size={16} /> : <Archive size={16} />}{archiveBusy ? 'Saving…' : workOrder.archivedAt ? 'Restore work order' : 'Archive work order'}</Button>{!workOrder.archivedAt && <Link className="button button-primary" to={`/produce/${workOrder.id}/${workOrder.routing[0]?.id}`}><QrCode size={17} /> Production view</Link>}</>} />
    {archiveError && <p className="form-error">{archiveError}</p>}
    {workOrder.archivedAt && <div className="notice-card"><strong>Archived work order</strong><p>Production entry is locked. The routing, traveler, and immutable event history remain available for reference.</p></div>}
    <section className="wo-meta-grid"><div><Package /><span>Order quantity</span><strong>{workOrder.quantityOrdered} pieces</strong></div><div><CalendarDays /><span>Due date</span><strong>{formatDate(workOrder.dueDate)}</strong></div><div><FileStack /><span>Sales order</span><strong>{order.salesOrderName}</strong></div><div><span className="metric-percent">{progress}%</span><span>Production progress</span><ProgressBar value={progress} label={false} /></div></section>
    {workOrder.notes && <div className="notice-card"><strong>Traveler notes</strong><p>{workOrder.notes}</p></div>}
    <section className="panel routing-panel"><div className="panel-header"><div><span className="eyebrow">Digital routing</span><h2>Production movement</h2></div><div className="panel-actions"><span className="subtle">Quantities derive from immutable events</span>{!workOrder.archivedAt && <Button variant="secondary" onClick={() => setAdjustmentOpen(true)}>Record overrun</Button>}</div></div>
      <div className="route-timeline">{workOrder.routing.map((step, index) => {
        const metric = metrics.find((candidate) => candidate.stepId === step.id)!
        const next = getNextStep(step, workOrder.routing)
        return <article className={`route-step ${metric.completedAt ? 'complete' : metric.entered > 0 ? 'active' : ''}`} key={step.id}>
          <div className="route-marker"><span>{metric.completedAt ? '✓' : step.sequenceNumber}</span>{index < workOrder.routing.length - 1 && <i />}</div>
          <div className="route-content"><header><div><span className="eyebrow">Step {step.sequenceNumber}</span><h3>{step.routingStepName}</h3></div>{!workOrder.archivedAt && <Link to={`/produce/${workOrder.id}/${step.id}`} className="small-action">Open station <ExternalLink size={14} /></Link>}</header>
            <p>{step.workInstructions}</p>
            <div className="quantity-strip"><div><span>Entered</span><strong>{metric.entered}</strong></div><div><span>Transferred</span><strong>{metric.transferred}</strong></div><div><span>Scrap</span><strong>{metric.scrapped}</strong></div><div className="available"><span>Available</span><strong>{metric.available}</strong></div><div><span>Next</span><strong>{next?.routingStepName ?? 'Complete'}</strong></div></div>
            <div className="timestamp-row"><span>Entered <strong>{formatDateTime(metric.enteredAt)}</strong></span><span>Started <strong>{formatDateTime(metric.startedAt)}</strong></span><span>Completed <strong>{formatDateTime(metric.completedAt)}</strong></span></div>
          </div>
        </article>
      })}</div>
    </section>
    {adjustmentOpen && <Modal title="Add overrun quantity" onClose={() => setAdjustmentOpen(false)}><form className="quantity-modal" onSubmit={async (event: FormEvent) => { event.preventDefault(); setAdjustmentBusy(true); setAdjustmentError(''); try { await addProductionAdjustment({ workOrderId: workOrder.id, routingStepId: workOrder.routing[0].id, quantity: Number(adjustmentQuantity) }); setAdjustmentOpen(false); setAdjustmentQuantity('') } catch (reason) { setAdjustmentError(reason instanceof Error ? reason.message : 'Unable to record overrun.') } finally { setAdjustmentBusy(false) } }}><label>Additional pieces<input autoFocus inputMode="numeric" pattern="[0-9]*" value={adjustmentQuantity} onChange={(event) => setAdjustmentQuantity(event.target.value.replace(/\D/g, ''))} placeholder="0" /></label><p className="subtle">Adds available quantity to the first routing step without changing the accepted order quantity.</p>{adjustmentError && <p className="form-error">{adjustmentError}</p>}<div className="modal-actions"><Button type="button" variant="ghost" onClick={() => setAdjustmentOpen(false)}>Cancel</Button><Button disabled={adjustmentBusy}>{adjustmentBusy ? 'Saving…' : 'Add quantity'}</Button></div></form></Modal>}
  </main>
}
