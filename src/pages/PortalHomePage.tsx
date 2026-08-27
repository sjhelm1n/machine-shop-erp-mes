import { ArrowRight, CalendarDays, CheckCircle2, Clock3, PackageCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, EmptyState, PageHeader, ProgressBar } from '../components/Ui'
import { useAuth } from '../context/AuthContext'
import { useShop } from '../context/ShopContext'
import { customerStage, salesOrderProgress } from '../domain/routing'
import { formatDate } from '../lib/format'

export function PortalHomePage() {
  const { profile } = useAuth()
  const { data } = useShop()
  const orders = data?.salesOrders.filter((order) => order.customerId === profile?.customerId) ?? []
  const customer = data?.customers.find((candidate) => candidate.id === profile?.customerId)
  return <main className="page portal-home">
    <PageHeader eyebrow="Customer portal" title={`Welcome, ${customer?.customerName ?? profile?.displayName}`} description="A clear view of accepted orders and current production progress." />
    {orders.length === 0 ? <EmptyState title="No orders to show" body="Accepted purchase orders will appear here." /> : <section className="portal-order-list">{orders.map((order) => {
      const workOrders = data?.workOrders.filter((workOrder) => workOrder.salesOrderId === order.id) ?? []
      const progress = salesOrderProgress(data?.workOrders ?? [], data?.productionEvents ?? [], order.id)
      const completed = workOrders.length > 0 && workOrders.every((workOrder) => workOrder.completionDate !== null)
      return <article className="portal-order-card" key={order.id}><header><div><span className="eyebrow">Customer PO {order.customerPoNumber}</span><h2>{order.salesOrderNumber}</h2></div><Badge tone={completed ? 'green' : 'blue'}>{completed ? 'Complete' : 'In progress'}</Badge></header><div className="portal-progress"><div><strong>{progress}%</strong><span>complete</span></div><ProgressBar value={progress} label={false} /></div><div className="portal-meta"><span><CalendarDays /> Due <strong>{formatDate(order.orderDueDate)}</strong></span><span>{completed ? <CheckCircle2 /> : <Clock3 />} {completed ? 'Completed' : 'On the shop floor'}</span></div><div className="portal-lines">{workOrders.map((workOrder) => <div key={workOrder.id}><PackageCheck /><span><strong>{workOrder.partNumber}</strong><small>{workOrder.quantityOrdered} pieces</small></span><Badge>{customerStage(workOrder, data?.productionEvents ?? [])}</Badge></div>)}</div><Link to={`/portal/orders/${order.id}`}>View order details <ArrowRight size={16} /></Link></article>
    })}</section>}
  </main>
}
