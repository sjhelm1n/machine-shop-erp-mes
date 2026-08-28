import { ArrowRight, CalendarDays, CheckCircle2, Clock3, PackageCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { CustomerPortalSnapshot } from '../domain/customerPortal'
import { customerStage, isSalesOrderCompleted, salesOrderProgress } from '../domain/routing'
import { formatDate } from '../lib/format'
import { Badge, EmptyState, ProgressBar } from './Ui'

export function PortalOrdersView({ snapshot, orderDetailsHref }: { snapshot: CustomerPortalSnapshot; orderDetailsHref?: (orderId: string) => string }) {
  if (snapshot.salesOrders.length === 0) return <EmptyState title="No orders to show" body="Accepted purchase orders will appear here." />

  return <section className="portal-order-list">{snapshot.salesOrders.map((order) => {
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
  })}</section>
}
