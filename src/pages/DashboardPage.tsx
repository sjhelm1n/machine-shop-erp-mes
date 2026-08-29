import { ArrowRight, CircleAlert, Clock3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, ProgressBar, StatCard } from '../components/Ui'
import { useShop } from '../context/ShopContext'
import { useAuth } from '../context/AuthContext'
import { salesOrderProgress, workOrderProgress } from '../domain/routing'
import { daysUntil, formatDate, hourInTimeZone } from '../lib/format'
import { DashboardVisualizations } from '../components/DashboardVisualizations'
import { ProductionCompleteOrdersTable } from '../components/ProductionCompleteOrdersTable'

export function DashboardPage() {
  const { data } = useShop()
  const { profile } = useAuth()
  if (!data) return null
  const plantTimezone = data.organization.plantTimezone
  const plantHour = hourInTimeZone(plantTimezone)
  const openWorkOrders = data.workOrders.filter((workOrder) => !workOrder.archivedAt && !workOrder.completionDate)
  const dueDays = new Map(openWorkOrders.map((workOrder) => [workOrder.id, daysUntil(workOrder.dueDate, plantTimezone)]))
  const salesOrderById = new Map(data.salesOrders.map((order) => [order.id, order]))
  const workOrdersBySalesOrder = new Map<string, typeof data.workOrders>()
  for (const workOrder of data.workOrders) {
    const related = workOrdersBySalesOrder.get(workOrder.salesOrderId)
    if (related) related.push(workOrder)
    else workOrdersBySalesOrder.set(workOrder.salesOrderId, [workOrder])
  }
  const overdue = openWorkOrders.filter((workOrder) => (dueDays.get(workOrder.id) ?? 0) < 0)
  const dueSoon = openWorkOrders.filter((workOrder) => (dueDays.get(workOrder.id) ?? 0) >= 0 && (dueDays.get(workOrder.id) ?? 0) <= 7)
  const unanswered = data.questions.filter((question) => question.senderType === 'customer' && !question.readAt)
  return <main className="page dashboard-page">
    <PageHeader eyebrow={new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: plantTimezone }).format(new Date())} title={`${plantHour < 12 ? 'Good morning' : plantHour < 18 ? 'Good afternoon' : 'Good evening'}, ${profile?.displayName.split(' ')[0] ?? 'team'}`} description="Here’s what needs attention across the shop." />
    <section className="stats-grid">
      <StatCard label="Open sales orders" value={data.salesOrders.filter((order) => !order.archivedAt && !(salesOrderProgress(workOrdersBySalesOrder.get(order.id) ?? [], data.productionEvents, order.id) === 100 && order.shippedAt && order.invoicedAt)).length} detail="Across active customers" href="/app/sales-orders" />
      <StatCard label="Open work orders" value={openWorkOrders.length} detail={`${dueSoon.length} due in 7 days`} href="/app/work-orders" />
      <StatCard label="Past due" value={overdue.length} detail={overdue.length ? 'Needs attention' : 'Nothing past due'} tone={overdue.length ? 'danger' : 'success'} href="/app/work-orders" />
      <StatCard label="Unanswered questions" value={unanswered.length} detail={unanswered.length ? 'Customer is waiting' : 'Inbox is clear'} tone={unanswered.length ? 'danger' : 'success'} href="/app/questions" />
    </section>
    <ProductionCompleteOrdersTable data={data} />
    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-header"><div><span className="eyebrow">Production</span><h2>Work orders due soon</h2></div><Link to="/app/work-orders">View all <ArrowRight size={16} /></Link></div>
        <div className="work-list">
          {openWorkOrders.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((workOrder) => {
            const order = salesOrderById.get(workOrder.salesOrderId)
            const progress = workOrderProgress(workOrder, data.productionEvents)
            const remaining = dueDays.get(workOrder.id) ?? 0
            return <Link to={`/app/work-orders/${workOrder.id}`} className="work-list-row" key={workOrder.id}>
              <div className="work-id"><strong>{workOrder.workOrderName}</strong><span>{workOrder.partNumber}</span></div>
              <div className="work-customer"><strong>{order?.customerName}</strong><span>{workOrder.quantityOrdered} pieces</span></div>
              <div className="work-progress"><ProgressBar value={progress} /></div>
              <div className={`due-chip ${remaining < 0 ? 'late' : remaining <= 3 ? 'soon' : ''}`}><Clock3 size={15} /><span><strong>{formatDate(workOrder.dueDate)}</strong><small>{remaining < 0 ? `${Math.abs(remaining)} days late` : `${remaining} days`}</small></span></div>
            </Link>
          })}
        </div>
      </section>
      <section className="panel attention-panel">
        <div className="panel-header"><div><span className="eyebrow">Attention</span><h2>Customer questions</h2></div><Link to="/app/questions">Inbox <ArrowRight size={16} /></Link></div>
        {unanswered.length === 0 ? <p className="subtle">No unanswered questions.</p> : unanswered.map((question) => {
          const customer = data.customers.find((candidate) => candidate.id === question.customerId)
          const order = data.salesOrders.find((candidate) => candidate.id === question.salesOrderId)
          return <Link to="/app/questions" className="question-preview" key={question.id}><CircleAlert size={19} /><div><strong>{customer?.customerName}</strong><span>{order?.salesOrderName}</span><p>{question.message}</p></div></Link>
        })}
      </section>
    </div>
    <DashboardVisualizations data={data} />
  </main>
}
