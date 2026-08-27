import { ArrowRight, CircleAlert, Clock3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, ProgressBar, StatCard } from '../components/Ui'
import { useShop } from '../context/ShopContext'
import { useAuth } from '../context/AuthContext'
import { workOrderProgress } from '../domain/routing'
import { daysUntil, formatDate } from '../lib/format'

export function DashboardPage() {
  const { data } = useShop()
  const { profile } = useAuth()
  if (!data) return null
  const openWorkOrders = data.workOrders.filter((workOrder) => !workOrder.completionDate)
  const overdue = openWorkOrders.filter((workOrder) => daysUntil(workOrder.dueDate) < 0)
  const dueSoon = openWorkOrders.filter((workOrder) => daysUntil(workOrder.dueDate) >= 0 && daysUntil(workOrder.dueDate) <= 7)
  const unanswered = data.questions.filter((question) => question.senderType === 'customer' && !question.readAt)
  return <main className="page dashboard-page">
    <PageHeader eyebrow={new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())} title={`${new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}, ${profile?.displayName.split(' ')[0] ?? 'team'}`} description="Here’s what needs attention across the shop." />
    <section className="stats-grid">
      <StatCard label="Open sales orders" value={data.salesOrders.filter((order) => data.workOrders.some((workOrder) => workOrder.salesOrderId === order.id && !workOrder.completionDate)).length} detail="Across 2 customers" href="/app/sales-orders" />
      <StatCard label="Open work orders" value={openWorkOrders.length} detail={`${dueSoon.length} due in 7 days`} href="/app/work-orders" />
      <StatCard label="Past due" value={overdue.length} detail={overdue.length ? 'Needs attention' : 'Nothing past due'} tone={overdue.length ? 'danger' : 'success'} href="/app/work-orders" />
      <StatCard label="Unanswered questions" value={unanswered.length} detail={unanswered.length ? 'Customer is waiting' : 'Inbox is clear'} tone={unanswered.length ? 'danger' : 'success'} href="/app/questions" />
    </section>
    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-header"><div><span className="eyebrow">Production</span><h2>Work orders due soon</h2></div><Link to="/app/work-orders">View all <ArrowRight size={16} /></Link></div>
        <div className="work-list">
          {openWorkOrders.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((workOrder) => {
            const order = data.salesOrders.find((candidate) => candidate.id === workOrder.salesOrderId)
            const progress = workOrderProgress(workOrder, data.productionEvents)
            const remaining = daysUntil(workOrder.dueDate)
            return <Link to={`/app/work-orders/${workOrder.id}`} className="work-list-row" key={workOrder.id}>
              <div className="work-id"><strong>{workOrder.workOrderNumber}</strong><span>{workOrder.partNumber}</span></div>
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
          return <Link to="/app/questions" className="question-preview" key={question.id}><CircleAlert size={19} /><div><strong>{customer?.customerName}</strong><span>{order?.salesOrderNumber}</span><p>{question.message}</p></div></Link>
        })}
      </section>
    </div>
  </main>
}
