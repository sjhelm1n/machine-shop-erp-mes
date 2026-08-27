import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, EmptyState, PageHeader, ProgressBar } from '../components/Ui'
import { useShop } from '../context/ShopContext'
import { customerStage, workOrderProgress } from '../domain/routing'
import { formatDate } from '../lib/format'

export function WorkOrdersPage() {
  const { data } = useShop()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'open' | 'completed' | 'all'>('open')
  const workOrders = useMemo(() => data?.workOrders.filter((workOrder) => {
    const matchesQuery = [workOrder.workOrderNumber, workOrder.partNumber, data.salesOrders.find((order) => order.id === workOrder.salesOrderId)?.customerName].join(' ').toLowerCase().includes(query.toLowerCase())
    const matchesStatus = status === 'all' || (status === 'completed' ? Boolean(workOrder.completionDate) : !workOrder.completionDate)
    return matchesQuery && matchesStatus
  }) ?? [], [data, query, status])
  return <main className="page">
    <PageHeader eyebrow="Production flow" title="Work orders" description="Status is calculated from movement, not manually maintained." action={<Link className="button button-primary" to="/app/sales-orders"><Plus size={17} /> Create from sales order</Link>} />
    <div className="toolbar"><label className="search-field"><Search size={18} /><input aria-label="Search work orders" placeholder="Search WO, part, or customer…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="segmented"><button className={status === 'open' ? 'active' : ''} onClick={() => setStatus('open')}>Open</button><button className={status === 'completed' ? 'active' : ''} onClick={() => setStatus('completed')}>Completed</button><button className={status === 'all' ? 'active' : ''} onClick={() => setStatus('all')}>All</button></div></div>
    {workOrders.length === 0 ? <EmptyState title="No work orders found" body="Try another search." /> : <div className="table-card"><table><thead><tr><th>Work order</th><th>Customer / SO</th><th>Quantity</th><th>Due</th><th>Stage</th><th>Progress</th></tr></thead><tbody>{workOrders.map((workOrder) => {
      const order = data?.salesOrders.find((candidate) => candidate.id === workOrder.salesOrderId)
      const progress = workOrderProgress(workOrder, data?.productionEvents ?? [])
      return <tr key={workOrder.id}><td><Link className="table-primary" to={`/app/work-orders/${workOrder.id}`}>{workOrder.workOrderNumber}</Link><small>{workOrder.partNumber}</small></td><td><strong>{order?.customerName}</strong><small>{order?.salesOrderNumber}</small></td><td>{workOrder.quantityOrdered} pcs</td><td>{formatDate(workOrder.dueDate)}</td><td><Badge tone={progress === 100 ? 'green' : 'blue'}>{customerStage(workOrder, data?.productionEvents ?? [])}</Badge></td><td className="progress-cell"><ProgressBar value={progress} /></td></tr>
    })}</tbody></table></div>}
  </main>
}
