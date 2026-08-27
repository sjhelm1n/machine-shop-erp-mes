import { AlertTriangle, ArrowUpRight, ChevronRight, LoaderCircle, X } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-header">
    <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>
    {action && <div className="page-actions">{action}</div>}
  </header>
}

export function Button({ className = '', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  return <button className={`button button-${variant} ${className}`} {...props} />
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function ProgressBar({ value, label = true }: { value: number; label?: boolean }) {
  const normalized = Math.max(0, Math.min(100, value))
  return <div className="progress-wrap">{label && <span>{normalized}%</span>}<progress className="progress-track" max="100" value={normalized} aria-label={`${normalized}% complete`} /></div>
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><div className="empty-icon">∅</div><h3>{title}</h3><p>{body}</p></div>
}

export function LoadingState() {
  return <div className="loading-state"><LoaderCircle className="spin" size={22} /> Loading shop data…</div>
}

export function ErrorState({ message }: { message: string }) {
  return <div className="error-state"><AlertTriangle size={20} /> <span>{message}</span></div>
}

export function EntityLink({ to, primary, secondary }: { to: string; primary: string; secondary?: string }) {
  return <Link className="entity-link" to={to}><span><strong>{primary}</strong>{secondary && <small>{secondary}</small>}</span><ChevronRight size={18} /></Link>
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button></header>
      {children}
    </section>
  </div>
}

export function StatCard({ label, value, detail, tone = 'default', href }: { label: string; value: string | number; detail: string; tone?: 'default' | 'danger' | 'success'; href?: string }) {
  const body = <><div className={`stat-mark stat-${tone}`} /><div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><small>{detail}</small></div>{href && <ArrowUpRight size={18} className="stat-arrow" />}</>
  return href ? <Link to={href} className="stat-card">{body}</Link> : <div className="stat-card">{body}</div>
}
