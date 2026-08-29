import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, EmptyState, PageHeader, ProgressBar } from '../components/Ui'
import { useShop } from '../context/ShopContext'
import { workOrderProgress, workOrderStageBreakdown, type WorkOrderStageBreakdown } from '../domain/routing'
import type { ProductionEvent, WorkOrder } from '../domain/types'
import { formatDate } from '../lib/format'

function stageTone(stage: WorkOrderStageBreakdown): 'neutral' | 'green' | 'red' | 'blue' {
  if (stage.quantity === 0) return 'neutral'
  if (stage.stageName === 'Complete') return 'green'
  if (stage.stageName === 'Scrapped') return 'red'
  return 'blue'
}

function WorkOrderStages({ workOrder, events }: { workOrder: WorkOrder; events: ProductionEvent[] }) {
  const stages = workOrderStageBreakdown(workOrder, events)
  const label = stages.map((stage) => `${stage.stageName}: ${stage.percentage}%`).join(', ')

  return <div className="stage-breakdown" aria-label={label}>
    {stages.map((stage) => <Badge key={stage.stageName} tone={stageTone(stage)}>
      <span title={`${stage.quantity} of ${workOrder.quantityOrdered} ordered pieces`}>
        {stage.percentage}% {stage.stageName}
      </span>
    </Badge>)}
  </div>
}

export function WorkOrdersPage() {
  const { data, loading, loadMore } = useShop()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'open' | 'completed' | 'all' | 'archived'>('open')
  const salesOrderById = useMemo(() => new Map(data?.salesOrders.map((order) => [order.id, order]) ?? []), [data?.salesOrders])
  const workOrders = useMemo(() => data?.workOrders.filter((workOrder) => {
    const matchesQuery = [workOrder.workOrderName, workOrder.partNumber, salesOrderById.get(workOrder.salesOrderId)?.customerName].join(' ').toLowerCase().includes(query.toLowerCase())
    const matchesStatus = status === 'archived' ? Boolean(workOrder.archivedAt) : !workOrder.archivedAt && (status === 'all' || (status === 'completed' ? Boolean(workOrder.completionDate) : !workOrder.completionDate))
    return matchesQuery && matchesStatus
  }) ?? [], [data, query, salesOrderById, status])
  return <main className="page">
    <PageHeader eyebrow="Production flow" title="Work orders" description="Stage percentages show where the ordered pieces are now, calculated from production movement." action={<Link className="button button-primary" to="/app/sales-orders"><Plus size={17} /> Create from sales order</Link>} />
    <div className="toolbar"><label className="search-field"><Search size={18} /><input aria-label="Search work orders" placeholder="Search WO, part, or customer…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="segmented"><button className={status === 'open' ? 'active' : ''} onClick={() => setStatus('open')}>Open</button><button className={status === 'completed' ? 'active' : ''} onClick={() => setStatus('completed')}>Completed</button><button className={status === 'all' ? 'active' : ''} onClick={() => setStatus('all')}>All</button><button className={status === 'archived' ? 'active' : ''} onClick={() => setStatus('archived')}>Archived</button></div></div>
    {workOrders.length === 0 ? <EmptyState title="No work orders found" body="Try another search or filter." /> : <div className="table-card"><table><thead><tr><th>Work order name</th><th>Customer / sales order</th><th>Quantity</th><th>Due</th><th>Stage distribution</th><th>Progress</th></tr></thead><tbody>{workOrders.map((workOrder) => {
      const order = salesOrderById.get(workOrder.salesOrderId)
      const progress = workOrderProgress(workOrder, data?.productionEvents ?? [])
      return <tr key={workOrder.id}><td><Link className="table-primary" to={`/app/work-orders/${workOrder.id}`}>{workOrder.workOrderName}</Link><small>{workOrder.partNumber}{workOrder.archivedAt ? ' · archived' : ''}</small></td><td><strong>{order?.customerName}</strong><small>{order?.salesOrderName}</small></td><td>{workOrder.quantityOrdered} pcs</td><td>{formatDate(workOrder.dueDate)}</td><td className="stage-cell"><WorkOrderStages workOrder={workOrder} events={data?.productionEvents ?? []} /></td><td className="progress-cell"><ProgressBar value={progress} /></td></tr>
    })}</tbody></table></div>}
    {data?.pageInfo?.workOrdersHasMore && <div className="form-actions"><Button variant="secondary" disabled={loading} onClick={() => void loadMore()}>{loading ? 'Loading…' : 'Load 100 more work orders'}</Button></div>}
  </main>
}
