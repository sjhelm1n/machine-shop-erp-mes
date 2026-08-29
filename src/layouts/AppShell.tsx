import { ChevronDown, ClipboardList, Factory, Files, HelpCircle, LayoutDashboard, LogOut, Menu, MonitorCheck, PackageCheck, QrCode, Route as RouteIcon, UserCog, Users, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ProductionQrScanner } from '../components/ProductionQrScanner'
import { useAuth } from '../context/AuthContext'
import { useShop } from '../context/ShopContext'
import { env } from '../lib/env'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  children?: NavItem[]
}

const manufacturerNav: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/sales-orders', label: 'Sales orders', icon: ClipboardList },
  { to: '/app/work-orders', label: 'Work orders', icon: Factory },
  { to: '/app/routing', label: 'Routing', icon: RouteIcon },
  {
    to: '/app/customers',
    label: 'Customers',
    icon: Users,
    end: true,
    children: [
      { to: '/app/questions', label: 'Questions', icon: HelpCircle },
      { to: '/app/documents', label: 'Document storage', icon: Files },
      { to: '/app/customers/portal-view', label: 'Customer Portal View', icon: MonitorCheck },
    ],
  },
  { to: '/app/users', label: 'Users', icon: UserCog },
]

const portalNav: NavItem[] = [
  { to: '/portal', label: 'My orders', icon: PackageCheck, end: true },
  { to: '/portal/questions', label: 'Questions', icon: HelpCircle },
  { to: '/portal/documents', label: 'Documents', icon: Files },
  { to: '/portal/users', label: 'Users', icon: UserCog },
]

function SidebarNavLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const Icon = item.icon
  return <NavLink to={item.to} end={item.end} onClick={onNavigate}><Icon size={19} /><span>{item.label}</span></NavLink>
}

function SidebarNavGroup({ item, onNavigate }: { item: NavItem & { children: NavItem[] }; onNavigate: () => void }) {
  const { pathname } = useLocation()
  const groupRouteActive = pathname === item.to || item.children.some((child) => pathname === child.to || pathname.startsWith(`${child.to}/`))
  const [expanded, setExpanded] = useState(groupRouteActive)
  const childrenId = `sidebar-${item.label.toLowerCase().replaceAll(' ', '-')}-children`

  useEffect(() => {
    if (groupRouteActive) setExpanded(true)
  }, [groupRouteActive])

  return <div className="sidebar-nav-group">
    <div className="sidebar-nav-parent">
      <SidebarNavLink item={item} onNavigate={onNavigate} />
      <button className={`sidebar-nav-toggle${expanded ? ' expanded' : ''}`} type="button" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.label} navigation`} aria-controls={childrenId} aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}><ChevronDown size={17} /></button>
    </div>
    {expanded && <div id={childrenId} className="sidebar-nav-children" role="group" aria-label={`${item.label} navigation`}>
      {item.children.map((child) => <SidebarNavItem key={child.to} item={child} onNavigate={onNavigate} />)}
    </div>}
  </div>
}

function SidebarNavItem({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  if (!item.children) return <SidebarNavLink item={item} onNavigate={onNavigate} />

  return <SidebarNavGroup item={item as NavItem & { children: NavItem[] }} onNavigate={onNavigate} />
}

export function AppShell() {
  const { profile, demoRole, setDemoRole, signOut } = useAuth()
  const { data } = useShop()
  const [open, setOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const closeScanner = useCallback(() => setScannerOpen(false), [])
  const nav = profile?.role === 'customer' ? portalNav : manufacturerNav
  return <div className="app-shell">
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="brand"><img className="brand-mark" src="/brand/shopcore-mark.png" alt="" aria-hidden="true" /><div><strong>ShopCore ERP</strong><span>{data?.organization.name ?? 'Shop operations'}</span></div><button className="sidebar-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X /></button></div>
      <nav>{nav.map((item) => <SidebarNavItem key={item.to} item={item} onNavigate={() => setOpen(false)} />)}</nav>
      <div className="sidebar-footer">
        {env.demoMode && <div className="demo-switch"><span>Demo view</span><div><button className={demoRole === 'manufacturer' ? 'active' : ''} onClick={() => setDemoRole('manufacturer')}>Shop</button><button className={demoRole === 'customer' ? 'active' : ''} onClick={() => setDemoRole('customer')}>Customer</button></div></div>}
        <div className="user-card"><div className="avatar">{profile?.displayName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><div><strong>{profile?.displayName}</strong><span>{profile?.role === 'manufacturer' ? 'Shop team' : 'Customer portal'}</span></div>{!env.demoMode && <button onClick={() => void signOut()} aria-label="Sign out"><LogOut size={17} /></button>}</div>
      </div>
    </aside>
    {open && <button className="nav-scrim" onClick={() => setOpen(false)} aria-label="Close navigation" />}
    <div className="app-main">
      <div className="mobile-bar"><button onClick={() => setOpen(true)} aria-label="Open navigation"><Menu /></button><strong><img className="mobile-logo" src="/brand/shopcore-mark.png" alt="" aria-hidden="true" />ShopCore ERP</strong>{profile?.role === 'manufacturer' ? <button className="mobile-scan-button" onClick={() => setScannerOpen(true)} aria-label="Scan traveler QR code"><QrCode /></button> : <span>Portal</span>}</div>
      <Outlet />
    </div>
    {scannerOpen && profile?.role === 'manufacturer' && <ProductionQrScanner onClose={closeScanner} />}
  </div>
}
