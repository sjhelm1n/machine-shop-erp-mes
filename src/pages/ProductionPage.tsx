import { ArrowLeft, ArrowRight, CheckCircle2, Minus, PackageCheck, RotateCcw, TriangleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, Modal } from '../components/Ui'
import { useShop } from '../context/ShopContext'
import { calculateStepMetrics, canTransfer, getNextStep } from '../domain/routing'

export function ProductionPage() {
  const { workOrderId, stepId } = useParams()
  const { data, loading, error: loadError, transact, undoLast, notice, clearNotice, lastEventId } = useShop()
  const [modal, setModal] = useState<'transfer' | 'scrap' | null>(null)
  const [quantity, setQuantity] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const workOrder = data?.workOrders.find((candidate) => candidate.id === workOrderId)
  const step = workOrder?.routing.find((candidate) => candidate.id === stepId)
  const metrics = useMemo(() => workOrder && data ? calculateStepMetrics(workOrder, data.productionEvents) : [], [workOrder, data])
  const metric = metrics.find((candidate) => candidate.stepId === stepId)
  const next = workOrder && step ? getNextStep(step, workOrder.routing) : null
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(clearNotice, 4500); return () => window.clearTimeout(timer) }, [notice, clearNotice])
  if (loading) return <main className="production-page"><div className="production-error">Loading production step…</div></main>
  if (loadError) return <main className="production-page"><div className="production-error" role="alert">{loadError}</div></main>
  if (!data || !workOrder || !step || !metric) return <main className="production-page"><div className="production-error">This production link is invalid.</div></main>

  const submit = async (type: 'transfer' | 'scrap', amount: number) => {
    if (!canTransfer(amount, metric.available)) { setError(`Enter a whole quantity from 1 to ${metric.available}.`); return }
    setBusy(true); setError('')
    try { await transact({ workOrderId: workOrder.id, routingStepId: step.id, eventType: type, quantity: amount, toRoutingStepId: type === 'transfer' ? next?.id ?? null : null }); setModal(null); setQuantity('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Transaction failed.') }
    finally { setBusy(false) }
  }

  return <main className="production-page">
    <header className="production-header"><Link to={`/app/work-orders/${workOrder.id}`}><ArrowLeft size={19} /> Work order</Link><span>LIVE PRODUCTION</span></header>
    {notice && <div className="transaction-toast"><CheckCircle2 /><span>{notice}{notice.startsWith('Transferred') ? ` to ${next?.routingStepName ?? 'Complete'}` : ''}</span>{lastEventId && <button onClick={() => void undoLast()}><RotateCcw size={16} /> Undo</button>}</div>}
    {error && !modal && <div className="production-action-error" role="alert"><TriangleAlert size={18} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={17} /></button></div>}
    <section className="production-ident"><span>{workOrder.workOrderNumber}</span><h1>{workOrder.partNumber}</h1><div><strong>STEP {step.sequenceNumber}</strong><h2>{step.routingStepName}</h2></div></section>
    <section className="production-quantity"><span>AVAILABLE HERE</span><strong>{metric.available}</strong><small>pieces</small></section>
    <section className="production-stats"><div><span>Transferred</span><strong>{metric.transferred}</strong></div><div><span>Scrapped</span><strong>{metric.scrapped}</strong></div><div><span>Next</span><strong>{next?.routingStepName ?? 'Complete'}</strong></div></section>
    <section className="production-actions">
      <button className="plus-one" disabled={metric.available < 1 || busy} onClick={() => void submit('transfer', 1)}><span>+1</span><ArrowRight /><small>to {next?.routingStepName ?? 'complete'}</small></button>
      <div className="action-pair"><button disabled={metric.available < 1 || busy} onClick={() => { setError(''); setModal('transfer') }}><PackageCheck /><span>Transfer qty</span></button><button className="scrap-action" disabled={metric.available < 1 || busy} onClick={() => { setError(''); setModal('scrap') }}><Minus /><span>Scrap qty</span></button></div>
      {metric.available > 1 && <Button className="transfer-all" variant="secondary" disabled={busy} onClick={() => void submit('transfer', metric.available)}>Transfer all {metric.available} available <ArrowRight size={18} /></Button>}
    </section>
    <p className="production-hint">No start or complete button. Timestamps update from this activity.</p>
    {modal && <Modal title={modal === 'scrap' ? 'Record scrap' : `Transfer to ${next?.routingStepName ?? 'Complete'}`} onClose={() => { setModal(null); setError('') }}><form className="quantity-modal" onSubmit={(event) => { event.preventDefault(); void submit(modal, Number(quantity)) }}><label>Quantity<input autoFocus inputMode="numeric" pattern="[0-9]*" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ''))} placeholder="0" /></label><span>{metric.available} available</span>{modal === 'scrap' && <div className="scrap-warning"><TriangleAlert /> <span>Confirm this irreversible shop-floor count. {quantity ? `${Math.max(0, metric.available - Number(quantity))} pieces will remain at this step.` : 'Enter the scrap quantity to see what remains.'}</span></div>}{error && <p className="form-error">{error}</p>}<div className="modal-actions"><Button type="button" variant="ghost" onClick={() => setModal(null)}><X size={17} /> Cancel</Button><Button variant={modal === 'scrap' ? 'danger' : 'primary'} disabled={busy}>{busy ? 'Saving…' : modal === 'scrap' ? 'Confirm scrap' : 'Transfer'}</Button></div></form></Modal>}
  </main>
}
