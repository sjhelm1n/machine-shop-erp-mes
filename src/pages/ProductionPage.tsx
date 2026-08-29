import { ArrowLeft, ArrowRight, CheckCircle2, Minus, PackageCheck, QrCode, RotateCcw, TriangleAlert, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ProductionQrScanner } from '../components/ProductionQrScanner'
import { Button, Modal } from '../components/Ui'
import { useShop } from '../context/ShopContext'
import { calculateStepMetrics, canTransfer, getNextStep } from '../domain/routing'
import { productionToolCheckoutRequirements } from '../domain/tooling'
import type { ProductionStepSnapshot } from '../domain/types'
import { env } from '../lib/env'
import { loadProductionStep, recordProductionEvent, reverseProductionEvent } from '../services/shopService'

type ProductionAction = 'transfer' | 'scrap'

export function ProductionPage() {
  const { workOrderId, stepId } = useParams()
  const shop = useShop()
  const [liveSnapshot, setLiveSnapshot] = useState<ProductionStepSnapshot | null>(null)
  const [liveLoading, setLiveLoading] = useState(!env.demoMode)
  const [liveLoadError, setLiveLoadError] = useState<string | null>(null)
  const [liveNotice, setLiveNotice] = useState<string | null>(null)
  const [liveLastEventId, setLiveLastEventId] = useState<string | null>(null)
  const [modal, setModal] = useState<ProductionAction | null>(null)
  const [quantity, setQuantity] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const retryRequest = useRef<{ key: string; requestId: string } | null>(null)
  const closeScanner = useCallback(() => setScannerOpen(false), [])

  const demoSnapshot = useMemo<ProductionStepSnapshot | null>(() => {
    if (!env.demoMode) return null
    const workOrder = shop.data?.workOrders.find((candidate) => candidate.id === workOrderId)
    const step = workOrder?.routing.find((candidate) => candidate.id === stepId)
    if (!workOrder || !step || !shop.data) return null
    const metric = calculateStepMetrics(workOrder, shop.data.productionEvents).find((candidate) => candidate.stepId === step.id)
    if (!metric) return null
    const next = getNextStep(step, workOrder.routing)
    return {
      workOrderId: workOrder.id,
      workOrderName: workOrder.workOrderName,
      partNumber: workOrder.partNumber,
      archivedAt: workOrder.archivedAt,
      stepId: step.id,
      sequenceNumber: step.sequenceNumber,
      routingStepName: step.routingStepName,
      available: metric.available,
      transferred: metric.transferred,
      scrapped: metric.scrapped,
      nextStepId: next?.id ?? null,
      nextStepName: next?.routingStepName ?? null,
      toolCheckoutRequirements: productionToolCheckoutRequirements(workOrder, step.id, shop.data.toolAssemblies),
    }
  }, [shop.data, stepId, workOrderId])

  const refreshLive = useCallback(async () => {
    if (env.demoMode) return
    if (!workOrderId || !stepId) {
      setLiveSnapshot(null)
      setLiveLoadError('This production link is invalid.')
      setLiveLoading(false)
      return
    }
    setLiveLoading(true)
    try {
      setLiveSnapshot(await loadProductionStep(workOrderId, stepId))
      setLiveLoadError(null)
    } catch (reason) {
      setLiveSnapshot(null)
      setLiveLoadError(reason instanceof Error ? reason.message : 'Unable to load this production step.')
    } finally {
      setLiveLoading(false)
    }
  }, [stepId, workOrderId])

  useEffect(() => { void refreshLive() }, [refreshLive])

  useEffect(() => {
    if (env.demoMode) return
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void refreshLive() }
    window.addEventListener('focus', refreshWhenVisible)
    window.addEventListener('pageshow', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('focus', refreshWhenVisible)
      window.removeEventListener('pageshow', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [refreshLive])

  const notice = env.demoMode ? shop.notice : liveNotice
  const lastEventId = env.demoMode ? shop.lastEventId : liveLastEventId
  const clearNotice = shop.clearNotice
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => {
      if (env.demoMode) clearNotice()
      else setLiveNotice(null)
    }, 4500)
    return () => window.clearTimeout(timer)
  }, [clearNotice, notice])

  const snapshot = env.demoMode ? demoSnapshot : liveSnapshot
  const loading = env.demoMode ? shop.loading : liveLoading
  const loadError = env.demoMode ? shop.error : liveLoadError

  if (loading) return <main className="production-page"><div className="production-error">Loading production step…</div></main>
  if (loadError) return <main className="production-page"><div className="production-error" role="alert">{loadError}</div></main>
  if (!snapshot) return <main className="production-page"><div className="production-error">This production link is invalid.</div></main>
  if (snapshot.archivedAt) return <main className="production-page"><div className="production-error"><p>This work order is archived. Restore it before recording production.</p><Link className="button button-secondary" to={`/app/work-orders/${snapshot.workOrderId}`}><ArrowLeft size={17} /> Return to work order</Link></div></main>

  const missingCurrentTools = snapshot.toolCheckoutRequirements.filter((requirement) => requirement.operationRole === 'current' && !requirement.checkedOut)
  const transferToolingBlocked = missingCurrentTools.length > 0
  const scrapToolingBlocked = missingCurrentTools.length > 0

  const submit = async (type: ProductionAction, amount: number) => {
    if ((type === 'transfer' && transferToolingBlocked) || (type === 'scrap' && scrapToolingBlocked)) {
      setError('Scan each listed Tool Assembly QR code and check the tool out before continuing.')
      return
    }
    if (!canTransfer(amount, snapshot.available)) { setError(`Enter a whole quantity from 1 to ${snapshot.available}.`); return }
    setBusy(true)
    setError('')
    try {
      if (env.demoMode) {
        await shop.transact({ workOrderId: snapshot.workOrderId, routingStepId: snapshot.stepId, eventType: type, quantity: amount, toRoutingStepId: type === 'transfer' ? snapshot.nextStepId : null })
      } else {
        const key = JSON.stringify({ workOrderId: snapshot.workOrderId, stepId: snapshot.stepId, type, amount, nextStepId: snapshot.nextStepId })
        if (retryRequest.current?.key !== key) retryRequest.current = { key, requestId: crypto.randomUUID() }
        const event = await recordProductionEvent({
          workOrderId: snapshot.workOrderId,
          routingStepId: snapshot.stepId,
          eventType: type,
          quantity: amount,
          toRoutingStepId: type === 'transfer' ? snapshot.nextStepId : null,
          requestId: retryRequest.current.requestId,
        })
        setLiveLastEventId(event.id)
        await refreshLive()
        retryRequest.current = null
        setLiveNotice(type === 'scrap' ? `Recorded ${amount} scrap` : `Transferred ${amount}`)
      }
      setModal(null)
      setQuantity('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Transaction failed.')
    } finally {
      setBusy(false)
    }
  }

  const undo = async () => {
    if (!lastEventId || busy) return
    setBusy(true)
    setError('')
    try {
      if (env.demoMode) await shop.undoLast()
      else {
        await reverseProductionEvent(lastEventId)
        await refreshLive()
        setLiveLastEventId(null)
        setLiveNotice('Last transaction undone')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to undo the transaction.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="production-page">
    <header className="production-header"><Link to={`/app/work-orders/${snapshot.workOrderId}`}><ArrowLeft size={19} /> Work order</Link><div className="production-header-actions"><span>LIVE PRODUCTION</span><button type="button" onClick={() => setScannerOpen(true)}><QrCode size={19} /> Scan QR</button></div></header>
    {notice && <div className="transaction-toast"><CheckCircle2 /><span>{notice}{notice.startsWith('Transferred') ? ` to ${snapshot.nextStepName ?? 'Complete'}` : ''}</span>{lastEventId && <button disabled={busy} onClick={() => void undo()}><RotateCcw size={16} /> Undo</button>}</div>}
    {error && !modal && <div className="production-action-error" role="alert"><TriangleAlert size={18} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={17} /></button></div>}
    <section className="production-ident"><span>{snapshot.workOrderName}</span><h1>{snapshot.partNumber}</h1><div><strong>STEP {snapshot.sequenceNumber}</strong><h2>{snapshot.routingStepName}</h2></div></section>
    {missingCurrentTools.length > 0 && <section className="production-tool-alert" role="status"><QrCode /><div><strong>Tool checkout required</strong><p>Scan each Tool Assembly QR label and complete Check Out before recording production at this operation.</p><ul>{missingCurrentTools.map((tool) => <li key={tool.toolAssemblyId}><span>{tool.assemblyNumber} · {tool.toolName}</span><small>Required for this operation</small></li>)}</ul></div></section>}
    <section className="production-quantity"><span>AVAILABLE HERE</span><strong>{snapshot.available}</strong><small>pieces</small></section>
    <section className="production-stats"><div><span>Transferred</span><strong>{snapshot.transferred}</strong></div><div><span>Scrapped</span><strong>{snapshot.scrapped}</strong></div><div><span>Next</span><strong>{snapshot.nextStepName ?? 'Complete'}</strong></div></section>
    <section className="production-actions">
      <button className="plus-one" disabled={snapshot.available < 1 || busy || transferToolingBlocked} onClick={() => void submit('transfer', 1)}><span>+1</span><ArrowRight /><small>to {snapshot.nextStepName ?? 'complete'}</small></button>
      <div className="action-pair"><button disabled={snapshot.available < 1 || busy || transferToolingBlocked} onClick={() => { setError(''); setModal('transfer') }}><PackageCheck /><span>Transfer qty</span></button><button className="scrap-action" disabled={snapshot.available < 1 || busy || scrapToolingBlocked} onClick={() => { setError(''); setModal('scrap') }}><Minus /><span>Scrap qty</span></button></div>
      {snapshot.available > 1 && <Button className="transfer-all" variant="secondary" disabled={busy || transferToolingBlocked} onClick={() => void submit('transfer', snapshot.available)}>Transfer all {snapshot.available} available <ArrowRight size={18} /></Button>}
    </section>
    <p className="production-hint">No start or complete button. Timestamps update from this activity.</p>
    {modal && <Modal title={modal === 'scrap' ? 'Record scrap' : `Transfer to ${snapshot.nextStepName ?? 'Complete'}`} onClose={() => { setModal(null); setError('') }}><form className="quantity-modal" onSubmit={(event) => { event.preventDefault(); void submit(modal, Number(quantity)) }}><label>Quantity<input autoFocus inputMode="numeric" pattern="[0-9]*" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ''))} placeholder="0" /></label><span>{snapshot.available} available</span>{modal === 'scrap' && <div className="scrap-warning"><TriangleAlert /> <span>Confirm this irreversible shop-floor count. {quantity ? `${Math.max(0, snapshot.available - Number(quantity))} pieces will remain at this step.` : 'Enter the scrap quantity to see what remains.'}</span></div>}{error && <p className="form-error">{error}</p>}<div className="modal-actions"><Button type="button" variant="ghost" onClick={() => setModal(null)}><X size={17} /> Cancel</Button><Button variant={modal === 'scrap' ? 'danger' : 'primary'} disabled={busy || (modal === 'transfer' ? transferToolingBlocked : scrapToolingBlocked)}>{busy ? 'Saving…' : modal === 'scrap' ? 'Confirm scrap' : 'Transfer'}</Button></div></form></Modal>}
    {scannerOpen && <ProductionQrScanner onClose={closeScanner} />}
  </main>
}
