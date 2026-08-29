import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { buildDemoProductionCompleteOpenOrders, type ProductionCompleteOpenOrder } from '../domain/dashboard'
import type { ShopData } from '../domain/types'
import { env } from '../lib/env'
import { formatDate } from '../lib/format'
import { loadProductionCompleteOpenOrders } from '../services/shopService'

function remainingStep(row: ProductionCompleteOpenOrder): string {
  if (!row.shippedAt && !row.invoicedAt) return 'Ship and invoice'
  if (!row.shippedAt) return 'Confirm shipment'
  return 'Confirm invoice'
}

export function ProductionCompleteOrdersTable({ data }: { data: ShopData }) {
  const [orders, setOrders] = useState<ProductionCompleteOpenOrder[]>(() => env.demoMode ? buildDemoProductionCompleteOpenOrders(data) : [])
  const [loading, setLoading] = useState(!env.demoMode)
  const [error, setError] = useState('')

  useEffect(() => {
    if (env.demoMode) {
      setOrders(buildDemoProductionCompleteOpenOrders(data))
      return
    }
    let active = true
    setLoading(true)
    setError('')
    void loadProductionCompleteOpenOrders()
      .then((rows) => { if (active) setOrders(rows) })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load production-complete sales orders.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [data])

  return <section className="table-card report-table dashboard-ready-orders">
    <div className="panel-header"><div><span className="eyebrow">Fulfillment</span><h2>Open sales orders with production complete</h2></div><Link to="/app/sales-orders">View all <ArrowRight size={16} /></Link></div>
    {error ? <p className="reporting-error">{error}</p> : loading ? <p className="report-empty">Loading production-complete orders…</p> : orders.length ? <div className="report-table-scroll"><table>
      <thead><tr><th>Sales order</th><th>Customer / PO</th><th>Due date</th><th>Production complete</th><th>Remaining</th></tr></thead>
      <tbody>{orders.map((row) => <tr key={row.salesOrderId}>
        <td><Link className="table-primary" to={`/app/sales-orders/${row.salesOrderId}`}>{row.salesOrderName}</Link></td>
        <td><strong>{row.customerName}</strong><small>PO {row.customerPoNumber}</small></td>
        <td>{formatDate(row.orderDueDate)}</td>
        <td>{formatDate(row.productionCompletedAt)}</td>
        <td><span className="badge badge-amber">{remainingStep(row)}</span></td>
      </tr>)}</tbody>
    </table></div> : <p className="report-empty"><CheckCircle2 size={17} /> No production-complete sales orders are waiting on shipment or invoicing.</p>}
  </section>
}
