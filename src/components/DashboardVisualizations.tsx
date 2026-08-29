import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartNoAxesCombined, ClockAlert } from 'lucide-react'
import { buildDemoDashboardMetrics, type DashboardMetrics, type DashboardRange } from '../domain/dashboard'
import type { ShopData } from '../domain/types'
import { env } from '../lib/env'
import { addCalendarDays, calendarDateInTimeZone, formatDate, formatDateTime, money, wholeNumber } from '../lib/format'
import { loadDashboardMetrics } from '../services/shopService'

type PeriodPreset = 'all' | '30' | '90' | '365' | 'custom'

const COLORS = ['#20633b', '#d96b34', '#387b93', '#8d6d34', '#7c5b92', '#6c7d43', '#9a4c43', '#6d7470']
const DELIVERY_COLORS = ['#3e8453', '#c45042']

function dashboardRange(preset: PeriodPreset, customStart: string, customEnd: string, timeZone: string): DashboardRange {
  const today = calendarDateInTimeZone(timeZone)
  if (preset === 'all') return { startDate: null, endDate: null }
  if (preset === '30') return { startDate: addCalendarDays(today, -29), endDate: today }
  if (preset === '90') return { startDate: addCalendarDays(today, -89), endDate: today }
  if (preset === '365') return { startDate: addCalendarDays(today, -364), endDate: today }
  const startDate = customStart || null
  const endDate = customEnd || null
  return { startDate, endDate }
}

function compactCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function idleDuration(hours: number): string {
  const days = Math.floor(hours / 24)
  const remainder = hours % 24
  return days ? `${days}d ${remainder}h` : `${hours}h`
}

function groupedRevenue(metrics: DashboardMetrics): Array<{ name: string; value: number }> {
  const top = metrics.revenueByCustomer.slice(0, 7).map((row) => ({ name: row.customerName, value: row.revenue }))
  const other = metrics.revenueByCustomer.slice(7).reduce((total, row) => total + row.revenue, 0)
  return other ? [...top, { name: 'Other clients', value: other }] : top
}

function ChartEmpty({ message }: { message: string }) {
  return <div className="chart-empty"><ChartNoAxesCombined size={25} /><span>{message}</span></div>
}

export function DashboardVisualizations({ data }: { data: ShopData }) {
  const [preset, setPreset] = useState<PeriodPreset>('all')
  const today = calendarDateInTimeZone(data.organization.plantTimezone)
  const [customStart, setCustomStart] = useState(addCalendarDays(today, -29))
  const [customEnd, setCustomEnd] = useState(today)
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(() => env.demoMode ? buildDemoDashboardMetrics(data, { startDate: null, endDate: null }) : null)
  const [loading, setLoading] = useState(!env.demoMode)
  const [error, setError] = useState<string | null>(null)
  const range = useMemo(
    () => dashboardRange(preset, customStart, customEnd, data.organization.plantTimezone),
    [preset, customStart, customEnd, data.organization.plantTimezone],
  )
  const invalidRange = Boolean(range.startDate && range.endDate && range.startDate > range.endDate)

  useEffect(() => {
    if (invalidRange) {
      setError('Start date must be on or before end date.')
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    if (env.demoMode) {
      setMetrics(buildDemoDashboardMetrics(data, range))
      setLoading(false)
      return () => { active = false }
    }
    void loadDashboardMetrics(range)
      .then((value) => { if (active) setMetrics(value) })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load dashboard reporting data.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [data, invalidRange, range])

  const revenueData = metrics ? groupedRevenue(metrics) : []
  const deliveryData = metrics ? [
    { name: 'On time', value: metrics.onTimeDelivery.onTime },
    { name: 'Late', value: metrics.onTimeDelivery.late },
  ].filter((row) => row.value > 0) : []
  const periodLabel = range.startDate || range.endDate
    ? `${range.startDate ? formatDate(range.startDate) : 'Beginning'} – ${range.endDate ? formatDate(range.endDate) : 'Today'}`
    : 'All recorded history'

  return <section className="dashboard-reporting" aria-labelledby="dashboard-reporting-title">
    <div className="reporting-header">
      <div><span className="eyebrow">Reporting</span><h2 id="dashboard-reporting-title">Shop performance</h2><p>{periodLabel}</p></div>
      <div className="reporting-filters">
        <label>Period
          <select value={preset} onChange={(event) => setPreset(event.target.value as PeriodPreset)}>
            <option value="all">All time</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
            <option value="custom">Custom dates</option>
          </select>
        </label>
        {preset === 'custom' ? <>
          <label>From<input type="date" value={customStart} max={customEnd || undefined} onChange={(event) => setCustomStart(event.target.value)} /></label>
          <label>Through<input type="date" value={customEnd} min={customStart || undefined} onChange={(event) => setCustomEnd(event.target.value)} /></label>
        </> : null}
      </div>
    </div>
    {error ? <p className="reporting-error">{error}</p> : null}
    {loading && !metrics ? <div className="reporting-loading">Loading shop performance…</div> : null}
    {metrics ? <>
      <div className={`visualization-grid${loading ? ' is-refreshing' : ''}`}>
        <section className="panel chart-panel">
          <div className="panel-header"><div><span className="eyebrow">Sales</span><h3>Revenue by client</h3></div><span className="chart-total">{money.format(metrics.revenueByCustomer.reduce((total, row) => total + row.revenue, 0))}</span></div>
          {revenueData.length ? <div className="chart-frame pie-frame" aria-label="Pie chart of total sales revenue by client">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart accessibilityLayer>
                <Pie data={revenueData} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={48} outerRadius={82} paddingAngle={2}>
                  {revenueData.map((row, index) => <Cell key={row.name} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => money.format(Number(value))} />
                <Legend iconType="square" verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>
          </div> : <ChartEmpty message="No sales revenue in this period." />}
        </section>

        <section className="panel chart-panel">
          <div className="panel-header"><div><span className="eyebrow">Fulfillment</span><h3>On-time delivery</h3></div><span className="chart-total">{metrics.onTimeDelivery.onTime + metrics.onTimeDelivery.late} shipped</span></div>
          {deliveryData.length ? <div className="chart-frame pie-frame" aria-label="Pie chart of on-time versus late deliveries">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart accessibilityLayer>
                <Pie data={deliveryData} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={48} outerRadius={82} paddingAngle={3}>
                  {deliveryData.map((row, index) => <Cell key={row.name} fill={DELIVERY_COLORS[index]} />)}
                </Pie>
                <Tooltip formatter={(value) => `${wholeNumber.format(Number(value))} orders`} />
                <Legend iconType="square" verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>
          </div> : <ChartEmpty message="No shipped sales orders in this period." />}
        </section>

        <section className="panel chart-panel chart-panel-wide">
          <div className="panel-header"><div><span className="eyebrow">Work in progress</span><h3>Sales revenue in production</h3></div><span className="chart-total">{money.format(metrics.productionRevenue.reduce((total, row) => total + row.revenue, 0))}</span></div>
          {metrics.productionRevenue.length ? <div className="chart-frame bar-frame" style={{ height: Math.max(280, metrics.productionRevenue.length * 46) }} aria-label="Bar chart of allocated sales revenue by active work order">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart accessibilityLayer layout="vertical" data={metrics.productionRevenue} margin={{ top: 12, right: 24, bottom: 8, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={compactCurrency} />
                <YAxis type="category" dataKey="workOrderName" width={86} tickLine={false} />
                <Tooltip formatter={(value) => money.format(Number(value))} labelFormatter={(label) => `Work order ${label}`} />
                <Bar dataKey="revenue" name="Revenue" fill="#20633b" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div> : <ChartEmpty message="No active work-order revenue in this period." />}
        </section>

        <section className="panel chart-panel chart-panel-wide">
          <div className="panel-header"><div><span className="eyebrow">Quality</span><h3>Scrapped parts over time</h3></div><span className="chart-total">{wholeNumber.format(metrics.scrapOverTime.reduce((total, row) => total + row.quantity, 0))} parts</span></div>
          {metrics.scrapOverTime.length ? <div className="chart-frame line-frame" aria-label="Line chart of scrapped parts over time">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart accessibilityLayer data={metrics.scrapOverTime} margin={{ top: 18, right: 24, bottom: 12, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(value) => formatDate(String(value)).replace(/, \d{4}$/, '')} minTickGap={24} />
                <YAxis allowDecimals={false} width={42} />
                <Tooltip labelFormatter={(value) => formatDate(String(value))} formatter={(value) => [`${wholeNumber.format(Number(value))} parts`, 'Scrap']} />
                <Line type="monotone" dataKey="quantity" name="Scrap" stroke="#c45042" strokeWidth={3} dot={{ r: 4, fill: '#c45042' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div> : <ChartEmpty message="No unreversed scrap in this period." />}
        </section>
      </div>

      <div className="dashboard-report-tables">
        <section className="table-card report-table">
          <div className="panel-header"><div><span className="eyebrow">Attention</span><h3>Work orders idle over 24 hours</h3></div><span className="chart-total">{metrics.idleWorkOrders.length} idle</span></div>
          {metrics.idleWorkOrders.length ? <div className="report-table-scroll"><table>
            <thead><tr><th>Work order</th><th>Client / Part</th><th>Last activity</th><th>Idle</th></tr></thead>
            <tbody>{metrics.idleWorkOrders.map((row) => <tr key={row.workOrderId}>
              <td><Link className="table-primary" to={`/app/work-orders/${row.workOrderId}`}>{row.workOrderName}</Link></td>
              <td><strong>{row.customerName}</strong><small>{row.partNumber}</small></td>
              <td>{formatDateTime(row.lastActivityAt, data.organization.plantTimezone)}</td>
              <td><span className="badge badge-red"><ClockAlert size={12} /> {idleDuration(row.idleHours)}</span></td>
            </tr>)}</tbody>
          </table></div> : <p className="report-empty">Every open work order has activity within the last 24 hours.</p>}
        </section>

        <section className="table-card report-table">
          <div className="panel-header"><div><span className="eyebrow">Throughput</span><h3>Lead time per work order</h3></div><span className="chart-total">{metrics.leadTimes.length} completed</span></div>
          {metrics.leadTimes.length ? <div className="report-table-scroll"><table>
            <thead><tr><th>Work order</th><th>Client / Part</th><th>Entered</th><th>Complete</th><th>Lead time</th></tr></thead>
            <tbody>{metrics.leadTimes.map((row) => <tr key={row.workOrderId}>
              <td><Link className="table-primary" to={`/app/work-orders/${row.workOrderId}`}>{row.workOrderName}</Link></td>
              <td><strong>{row.customerName}</strong><small>{row.partNumber}</small></td>
              <td>{formatDate(row.enteredDate)}</td>
              <td>{formatDate(row.completionDate)}</td>
              <td><strong>{row.leadTimeDays} {row.leadTimeDays === 1 ? 'day' : 'days'}</strong></td>
            </tr>)}</tbody>
          </table></div> : <p className="report-empty">No completed work orders in this period.</p>}
        </section>
      </div>
    </> : null}
  </section>
}
