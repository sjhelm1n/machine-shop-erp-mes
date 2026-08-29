import { ArrowRight, CalendarDays, CheckCircle2, Clock3, PackageCheck, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { filterCustomerPortalOrders, type CustomerOrderStatusFilter, type CustomerPortalSnapshot } from '../domain/customerPortal'
import { customerStage, isSalesOrderCompleted, salesOrderProgress } from '../domain/routing'
import { formatDate } from '../lib/format'
import { Badge, EmptyState, ProgressBar } from './Ui'

export function PortalOrdersView({ snapshot, orderDetailsHref }: { snapshot: CustomerPortalSnapshot; orderDetailsHref?: (orderId: string) => string }) {
  const [status, setStatus] = useState<CustomerOrderStatusFilter>('all')
  const [query, setQuery] = useState('')
  const completedCount = useMemo(
    () => snapshot.salesOrders.filter((order) => isSalesOrderCompleted(order, snapshot.workOrders, snapshot.productionEvents)).length,
    [snapshot],
  )
  const orders = useMemo(() => filterCustomerPortalOrders(snapshot, status, query), [query, snapshot, status])

  if (snapshot.salesOrders.length === 0) return <EmptyState title="No orders to show" body="Accepted purchase orders will appear here." />

  return <>
    <div className="toolbar portal-order-toolbar">
      <label className="search-field"><Search size={18} /><input aria-label="Search orders" placeholder="Search order, PO, or part…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="segmented" aria-label="Order status"><button className={status === 'all' ? 'active' : ''} onClick={() => setStatus('all')}>All ({snapshot.salesOrders.length})</button><button className={status === 'in_progress' ? 'active' : ''} onClick={() => setStatus('in_progress')}>In progress ({snapshot.salesOrders.length - completedCount})</button><button className={status === 'complete' ? 'active' : ''} onClick={() => setStatus('complete')}>Complete ({completedCount})</button></div>
    </div>
    {orders.length === 0 ? <EmptyState title="No matching orders" body="Try another search or status filter." /> : <section className="portal-order-list">{orders.map((order) => {
    const workOrders = snapshot.workOrders.filter((workOrder) => workOrder.salesOrderId === order.id)
    const progress = salesOrderProgress(snapshot.workOrders, snapshot.productionEvents, order.id)
    const completed = isSalesOrderCompleted(order, snapshot.workOrders, snapshot.productionEvents)
    const detailLabel = <>View order details <ArrowRight size={16} /></>
    const detailsHref = orderDetailsHref?.(order.id)

    return <article className="portal-order-card" key={order.id}>
      <header><div><span className="eyebrow">Customer PO {order.customerPoNumber}</span><h2>{order.salesOrderName}</h2></div><Badge tone={completed ? 'green' : 'blue'}>{completed ? 'Complete' : 'In progress'}</Badge></header>
      <div className="portal-progress"><div><strong>{progress}%</strong><span>complete</span></div><ProgressBar value={progress} label={false} /></div>
      <div className="portal-meta"><span><CalendarDays /> Due <strong>{formatDate(order.orderDueDate)}</strong></span><span>{completed ? <CheckCircle2 /> : <Clock3 />} {completed ? 'Completed' : 'On the shop floor'}</span></div>
      <div className="portal-lines">{workOrders.map((workOrder) => <div key={workOrder.id}><PackageCheck /><span><strong>{workOrder.partNumber}</strong><small>{workOrder.quantityOrdered} pieces</small></span><Badge>{customerStage(workOrder, snapshot.productionEvents)}</Badge></div>)}</div>
      {detailsHref ? <Link to={detailsHref}>{detailLabel}</Link> : <span className="portal-order-details-preview" aria-disabled="true">{detailLabel}</span>}
    </article>
    })}</section>}
  </>
}
