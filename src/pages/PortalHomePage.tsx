import { PortalOrdersView } from '../components/PortalOrdersView'
import { PageHeader } from '../components/Ui'
import { useAuth } from '../context/AuthContext'
import { useShop } from '../context/ShopContext'
import { customerPortalSnapshot } from '../domain/customerPortal'

export function PortalHomePage() {
  const { profile } = useAuth()
  const { data } = useShop()
  const customerId = profile?.customerId ?? ''
  const snapshot = data ? customerPortalSnapshot(data, customerId) : null
  return <main className="page portal-home">
    <PageHeader eyebrow="Customer portal" title={`Welcome, ${snapshot?.customer?.customerName ?? profile?.displayName}`} description="A clear view of accepted orders and current production progress." />
    {snapshot && <PortalOrdersView snapshot={snapshot} orderDetailsHref={(orderId) => `/portal/orders/${orderId}`} />}
  </main>
}
