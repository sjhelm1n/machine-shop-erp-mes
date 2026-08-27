import { ClipboardList, Factory, FileText, HelpCircle, LayoutDashboard, LogOut, Menu, PackageCheck, Users, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useShop } from '../context/ShopContext'
import { env } from '../lib/env'

const manufacturerNav = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/customers', label: 'Customers', icon: Users },
  { to: '/app/sales-orders', label: 'Sales orders', icon: ClipboardList },
  { to: '/app/work-orders', label: 'Work orders', icon: Factory },
  { to: '/app/questions', label: 'Questions', icon: HelpCircle },
  { to: '/app/invoices', label: 'Invoices', icon: FileText },
]

const portalNav = [
  { to: '/portal', label: 'My orders', icon: PackageCheck, end: true },
  { to: '/portal/questions', label: 'Questions', icon: HelpCircle },
  { to: '/portal/invoices', label: 'Invoices', icon: FileText },
]

export function AppShell() {
  const { profile, demoRole, setDemoRole, signOut } = useAuth()
  const { data } = useShop()
  const [open, setOpen] = useState(false)
  const nav = profile?.role === 'customer' ? portalNav : manufacturerNav
  return <div className="app-shell">
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="brand"><img className="brand-mark" src="/brand/shopcore-mark.png" alt="" aria-hidden="true" /><div><strong>ShopCore ERP</strong><span>{data?.organization.name ?? 'Shop operations'}</span></div><button className="sidebar-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X /></button></div>
      <nav>{nav.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}><Icon size={19} /><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-footer">
        {env.demoMode && <div className="demo-switch"><span>Demo view</span><div><button className={demoRole === 'manufacturer' ? 'active' : ''} onClick={() => setDemoRole('manufacturer')}>Shop</button><button className={demoRole === 'customer' ? 'active' : ''} onClick={() => setDemoRole('customer')}>Customer</button></div></div>}
        <div className="user-card"><div className="avatar">{profile?.displayName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><div><strong>{profile?.displayName}</strong><span>{profile?.role === 'manufacturer' ? 'Shop team' : 'Customer portal'}</span></div>{!env.demoMode && <button onClick={() => void signOut()} aria-label="Sign out"><LogOut size={17} /></button>}</div>
      </div>
    </aside>
    {open && <button className="nav-scrim" onClick={() => setOpen(false)} aria-label="Close navigation" />}
    <div className="app-main">
      <div className="mobile-bar"><button onClick={() => setOpen(true)} aria-label="Open navigation"><Menu /></button><strong><img className="mobile-logo" src="/brand/shopcore-mark.png" alt="" aria-hidden="true" />ShopCore ERP</strong><span>{profile?.role === 'customer' ? 'Portal' : 'Shop'}</span></div>
      <Outlet />
    </div>
  </div>
}
