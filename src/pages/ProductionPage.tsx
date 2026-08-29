import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Minus, PackageCheck, RefreshCw, RotateCcw, Smartphone, TriangleAlert, Wifi, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, Modal } from '../components/Ui'
import { useAuth } from '../context/AuthContext'
import { useShop } from '../context/ShopContext'
import { calculateStepMetrics, canTransfer, getNextStep } from '../domain/routing'
import type { ProductionStepSnapshot } from '../domain/types'
import { env } from '../lib/env'
import { clearProductionDevice, clearProductionSession, loadProductionDevice, loadStationProductionStep, productionAccessStatus, recordStationProductionEvent, registerProductionDevice, reverseStationProductionEvent, setProductionPin, unlockProduction, type ProductionAccessStatus, type ProductionDeviceCredential } from '../services/productionAccessService'
import { loadProductionStep, recordProductionEvent, reverseProductionEvent } from '../services/shopService'

type ProductionAction = 'transfer' | 'scrap'
const shortDeviceId = (deviceId: string) => deviceId.split('-')[0].toUpperCase()

export function ProductionPage() {
  const { workOrderId, stepId } = useParams()
  const auth = useAuth()
  const shop = useShop()
  const [device, setDevice] = useState<ProductionDeviceCredential | null>(() => loadProductionDevice())
  const [access, setAccess] = useState<ProductionAccessStatus | null>(null)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [accessBusy, setAccessBusy] = useState(false)
  const [accessError, setAccessError] = useState('')
  const [liveSnapshot, setLiveSnapshot] = useState<ProductionStepSnapshot | null>(null)
  const [liveLoading, setLiveLoading] = useState(!env.demoMode)
  const [liveLoadError, setLiveLoadError] = useState<string | null>(null)
  const [liveNotice, setLiveNotice] = useState<string | null>(null)
  const [liveLastEventId, setLiveLastEventId] = useState<string | null>(null)
  const [modal, setModal] = useState<ProductionAction | null>(null)
  const [quantity, setQuantity] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const retryRequest = useRef<{ key: string; requestId: string } | null>(null)
  const stationMode = !env.demoMode && !auth.profile

  const demoSnapshot = useMemo<ProductionStepSnapshot | null>(() => {
    if (!env.demoMode) return null
    const workOrder = shop.data?.workOrders.find((candidate) => candidate.id === workOrderId)
    const step = workOrder?.routing.find((candidate) => candidate.id === stepId)
    if (!workOrder || !step || !shop.data) return null
    const metric = calculateStepMetrics(workOrder, shop.data.productionEvents).find((candidate) => candidate.stepId === step.id)
    if (!metric) return null
    const next = getNextStep(step, workOrder.routing)
    return { workOrderId: workOrder.id, workOrderName: workOrder.workOrderName, partNumber: workOrder.partNumber, archivedAt: workOrder.archivedAt, stepId: step.id, sequenceNumber: step.sequenceNumber, routingStepName: step.routingStepName, available: metric.available, transferred: metric.transferred, scrapped: metric.scrapped, nextStepId: next?.id ?? null, nextStepName: next?.routingStepName ?? null }
  }, [shop.data, stepId, workOrderId])

  const refreshAccess = useCallback(async () => {
    if (env.demoMode || auth.loading || auth.profile || !workOrderId) return
    setAccessBusy(true)
    setAccessError('')
    try {
      let current = device
      if (!current) {
        current = await registerProductionDevice(workOrderId)
        setDevice(current)
      }
      setAccess(await productionAccessStatus(current))
    } catch (reason) {
      setAccessError(reason instanceof Error ? reason.message : 'Unable to register this device.')
    } finally {
      setAccessBusy(false)
      setLiveLoading(false)
    }
  }, [auth.loading, auth.profile, device, workOrderId])

  useEffect(() => { void refreshAccess() }, [refreshAccess])

  const refreshLive = useCallback(async () => {
    if (env.demoMode || auth.loading) return
    if (!workOrderId || !stepId) {
      setLiveSnapshot(null); setLiveLoadError('This production link is invalid.'); setLiveLoading(false); return
    }
    if (stationMode && (access?.state !== 'ready' || !device)) return
    if (auth.profile?.role === 'customer') {
      setLiveLoadError('Customer accounts cannot record production.'); setLiveLoading(false); return
    }
    setLiveLoading(true)
    try {
      setLiveSnapshot(stationMode ? await loadStationProductionStep(device!, workOrderId, stepId) : await loadProductionStep(workOrderId, stepId))
      setLiveLoadError(null)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Unable to load this production step.'
      if (stationMode && /different network/i.test(message)) {
        setAccess((current) => current ? { ...current, state: 'network_pending' } : current)
      } else if (stationMode && /session|PIN/i.test(message)) {
        clearProductionSession(); setAccess((current) => current ? { ...current, state: 'locked' } : current)
      } else { setLiveSnapshot(null); setLiveLoadError(message) }
    } finally { setLiveLoading(false) }
  }, [access?.state, auth.loading, auth.profile?.role, device, stationMode, stepId, workOrderId])

  useEffect(() => { void refreshLive() }, [refreshLive])

  const submitPin = async (event: FormEvent) => {
    event.preventDefault()
    if (!device || !access) return
    setAccessBusy(true); setAccessError('')
    try {
      if (access.state === 'needs_pin') {
        if (pin !== confirmPin) throw new Error('PINs do not match.')
        await setProductionPin(device, pin)
        setAccess({ ...access, state: 'locked' }); setPin(''); setConfirmPin('')
      } else {
        await unlockProduction(device, pin)
        setAccess({ ...access, state: 'ready' }); setPin('')
      }
    } catch (reason) { setAccessError(reason instanceof Error ? reason.message : 'Unable to unlock production.') }
    finally { setAccessBusy(false) }
  }

  const notice = env.demoMode ? shop.notice : liveNotice
  const lastEventId = env.demoMode ? shop.lastEventId : liveLastEventId
  const clearNotice = shop.clearNotice
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => env.demoMode ? clearNotice() : setLiveNotice(null), 4500)
    return () => window.clearTimeout(timer)
  }, [clearNotice, notice])

  const snapshot = env.demoMode ? demoSnapshot : liveSnapshot
  const loading = env.demoMode ? shop.loading : auth.loading || liveLoading
  const loadError = env.demoMode ? shop.error : liveLoadError

  if (!env.demoMode && auth.loading) return <main className="production-page"><div className="production-error">Checking production access…</div></main>
  if (stationMode && access?.state !== 'ready') return <main className="production-page"><section className="production-access-card">
    <Smartphone size={36} />
    <span className="production-access-kicker">SHOPCORE DEVICE ACCESS</span>
    <h1>{access?.state === 'needs_pin' ? 'Create your production PIN' : access?.state === 'locked' ? `Welcome, ${access.operatorName ?? 'operator'}` : access?.state === 'network_pending' ? 'Network approval needed' : 'Device approval needed'}</h1>
    {(access?.state === 'pending' || access?.state === 'network_pending') && <>
      <p>{access.state === 'network_pending' ? 'This phone is using a different network. A super admin must approve the network change on the Users page.' : 'Ask a super admin to open Users, assign this phone to you, and approve it.'}</p>
      {device && <div className="production-device-code"><small>DEVICE ID</small><strong>{shortDeviceId(device.deviceId)}</strong></div>}
      <Button variant="secondary" disabled={accessBusy} onClick={() => void refreshAccess()}><RefreshCw size={17} /> {accessBusy ? 'Checking…' : 'Check approval'}</Button>
    </>}
    {(access?.state === 'needs_pin' || access?.state === 'locked') && <form className="production-pin-form" onSubmit={submitPin}>
      <p>{access.state === 'needs_pin' ? 'Choose a unique six-digit PIN for production transactions on approved devices.' : 'Enter your six-digit production PIN. This is not your ERP password.'}</p>
      <label>Six-digit PIN<input autoFocus type="password" inputMode="numeric" pattern="[0-9]{6}" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} required /></label>
      {access.state === 'needs_pin' && <label>Confirm PIN<input type="password" inputMode="numeric" pattern="[0-9]{6}" autoComplete="off" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 6))} required /></label>}
      <Button disabled={accessBusy || pin.length !== 6 || (access.state === 'needs_pin' && confirmPin.length !== 6)}><KeyRound size={17} /> {accessBusy ? 'Checking…' : access.state === 'needs_pin' ? 'Save PIN' : 'Unlock production'}</Button>
    </form>}
    {!access && !accessError && <p>Registering this phone…</p>}
    {accessError && <><p className="form-error" role="alert">{accessError}</p>{device && <Button variant="secondary" onClick={() => { clearProductionDevice(); setDevice(null); setAccess(null); setAccessError('') }}><RefreshCw size={17} /> Register this phone again</Button>}</>}
    <small className="production-network-note"><Wifi size={13} /> Device approval is also tied to the shop network.</small>
  </section></main>

  if (loading) return <main className="production-page"><div className="production-error">Loading production step…</div></main>
  if (loadError) return <main className="production-page"><div className="production-error" role="alert">{loadError}</div></main>
  if (!snapshot) return <main className="production-page"><div className="production-error">This production link is invalid.</div></main>
  if (snapshot.archivedAt) return <main className="production-page"><div className="production-error"><p>This work order is archived. Restore it before recording production.</p>{!stationMode && <Link className="button button-secondary" to={`/app/work-orders/${snapshot.workOrderId}`}><ArrowLeft size={17} /> Return to work order</Link>}</div></main>

  const submit = async (type: ProductionAction, amount: number) => {
    if (!canTransfer(amount, snapshot.available)) { setError(`Enter a whole quantity from 1 to ${snapshot.available}.`); return }
    setBusy(true); setError('')
    try {
      if (env.demoMode) {
        await shop.transact({ workOrderId: snapshot.workOrderId, routingStepId: snapshot.stepId, eventType: type, quantity: amount, toRoutingStepId: type === 'transfer' ? snapshot.nextStepId : null })
      } else {
        const key = JSON.stringify({ workOrderId: snapshot.workOrderId, stepId: snapshot.stepId, type, amount, nextStepId: snapshot.nextStepId })
        if (retryRequest.current?.key !== key) retryRequest.current = { key, requestId: crypto.randomUUID() }
        const input = { workOrderId: snapshot.workOrderId, routingStepId: snapshot.stepId, eventType: type, quantity: amount, toRoutingStepId: type === 'transfer' ? snapshot.nextStepId : null, requestId: retryRequest.current.requestId }
        const posted = stationMode ? await recordStationProductionEvent(device!, input) : await recordProductionEvent(input)
        setLiveLastEventId(posted.id); await refreshLive(); retryRequest.current = null
        setLiveNotice(type === 'scrap' ? `Recorded ${amount} scrap` : `Transferred ${amount}`)
      }
      setModal(null); setQuantity('')
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Transaction failed.'
      if (stationMode && /different network/i.test(message)) setAccess((current) => current ? { ...current, state: 'network_pending' } : current)
      else if (stationMode && /session|PIN/i.test(message)) { clearProductionSession(); setAccess((current) => current ? { ...current, state: 'locked' } : current) }
      else setError(message)
    } finally { setBusy(false) }
  }

  const undo = async () => {
    if (!lastEventId || busy) return
    setBusy(true); setError('')
    try {
      if (env.demoMode) await shop.undoLast()
      else {
        if (stationMode) await reverseStationProductionEvent(device!, lastEventId)
        else await reverseProductionEvent(lastEventId)
        await refreshLive(); setLiveLastEventId(null); setLiveNotice('Last transaction undone')
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to undo the transaction.') }
    finally { setBusy(false) }
  }

  return <main className="production-page">
    <header className="production-header">{stationMode ? <span>{access?.operatorName ?? 'OPERATOR'} · DEVICE {device ? shortDeviceId(device.deviceId) : ''}</span> : <Link to={`/app/work-orders/${snapshot.workOrderId}`}><ArrowLeft size={19} /> Work order</Link>}<span>LIVE PRODUCTION</span></header>
    {notice && <div className="transaction-toast"><CheckCircle2 /><span>{notice}{notice.startsWith('Transferred') ? ` to ${snapshot.nextStepName ?? 'Complete'}` : ''}</span>{lastEventId && <button disabled={busy} onClick={() => void undo()}><RotateCcw size={16} /> Undo</button>}</div>}
    {error && !modal && <div className="production-action-error" role="alert"><TriangleAlert size={18} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={17} /></button></div>}
    <section className="production-ident"><span>{snapshot.workOrderName}</span><h1>{snapshot.partNumber}</h1><div><strong>STEP {snapshot.sequenceNumber}</strong><h2>{snapshot.routingStepName}</h2></div></section>
    <section className="production-quantity"><span>AVAILABLE HERE</span><strong>{snapshot.available}</strong><small>pieces</small></section>
    <section className="production-stats"><div><span>Transferred</span><strong>{snapshot.transferred}</strong></div><div><span>Scrapped</span><strong>{snapshot.scrapped}</strong></div><div><span>Next</span><strong>{snapshot.nextStepName ?? 'Complete'}</strong></div></section>
    <section className="production-actions">
      <button className="plus-one" disabled={snapshot.available < 1 || busy} onClick={() => void submit('transfer', 1)}><span>+1</span><ArrowRight /><small>to {snapshot.nextStepName ?? 'complete'}</small></button>
      <div className="action-pair"><button disabled={snapshot.available < 1 || busy} onClick={() => { setError(''); setModal('transfer') }}><PackageCheck /><span>Transfer qty</span></button><button className="scrap-action" disabled={snapshot.available < 1 || busy} onClick={() => { setError(''); setModal('scrap') }}><Minus /><span>Scrap qty</span></button></div>
      {snapshot.available > 1 && <Button className="transfer-all" variant="secondary" disabled={busy} onClick={() => void submit('transfer', snapshot.available)}>Transfer all {snapshot.available} available <ArrowRight size={18} /></Button>}
    </section>
    <p className="production-hint">No start or complete button. Timestamps update from this activity.</p>
    {modal && <Modal title={modal === 'scrap' ? 'Record scrap' : `Transfer to ${snapshot.nextStepName ?? 'Complete'}`} onClose={() => { setModal(null); setError('') }}><form className="quantity-modal" onSubmit={(event) => { event.preventDefault(); void submit(modal, Number(quantity)) }}><label>Quantity<input autoFocus inputMode="numeric" pattern="[0-9]*" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ''))} placeholder="0" /></label><span>{snapshot.available} available</span>{modal === 'scrap' && <div className="scrap-warning"><TriangleAlert /> <span>Confirm this irreversible shop-floor count. {quantity ? `${Math.max(0, snapshot.available - Number(quantity))} pieces will remain at this step.` : 'Enter the scrap quantity to see what remains.'}</span></div>}{error && <p className="form-error">{error}</p>}<div className="modal-actions"><Button type="button" variant="ghost" onClick={() => setModal(null)}><X size={17} /> Cancel</Button><Button variant={modal === 'scrap' ? 'danger' : 'primary'} disabled={busy}>{busy ? 'Saving…' : modal === 'scrap' ? 'Confirm scrap' : 'Transfer'}</Button></div></form></Modal>}
  </main>
}
