import { CheckCheck, Download, Eye, Files, HelpCircle, MessageSquare, PackageCheck, Send } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PortalOrdersView } from '../components/PortalOrdersView'
import { CustomerDocumentTerms } from '../components/CustomerDocumentTerms'
import { Badge, Button, EmptyState, PageHeader } from '../components/Ui'
import { useShop } from '../context/ShopContext'
import { customerPortalSnapshot, type CustomerPortalSnapshot } from '../domain/customerPortal'
import { documentTypeLabels } from '../domain/documentFilters'
import { env } from '../lib/env'
import { formatDate, formatDateTime, money } from '../lib/format'
import { getDocumentUrl } from '../services/shopService'

type PreviewSection = 'orders' | 'questions' | 'documents'

const previewSections = [
  { id: 'orders' as const, label: 'Orders', icon: PackageCheck },
  { id: 'questions' as const, label: 'Questions', icon: HelpCircle },
  { id: 'documents' as const, label: 'Documents', icon: Files },
]

function PreviewHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="portal-preview-heading"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></header>
}

function QuestionsPreview({ snapshot }: { snapshot: CustomerPortalSnapshot }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const threadKeys = [...new Set(snapshot.questions.map((question) => question.salesOrderId ?? `customer:${question.customerId}`))]
  const activeKey = selectedKey && threadKeys.includes(selectedKey) ? selectedKey : threadKeys[0] ?? null
  const selectedMessages = snapshot.questions.filter((question) => (question.salesOrderId ?? `customer:${question.customerId}`) === activeKey)
  const selectedOrder = snapshot.salesOrders.find((order) => order.id === activeKey)

  return <>
    <PreviewHeading eyebrow="Order-linked Q&A" title="Questions" description="Plain-text conversations tied to accepted orders." />
    {threadKeys.length === 0 ? <EmptyState title="No questions yet" body="The customer can ask the shop a question about an accepted order." /> : <section className="messages-shell portal-preview-messages">
      <aside className="thread-list">{threadKeys.map((key) => {
        const messages = snapshot.questions.filter((question) => (question.salesOrderId ?? `customer:${question.customerId}`) === key)
        const latest = messages.at(-1)!
        const order = snapshot.salesOrders.find((candidate) => candidate.id === key)
        const unread = messages.some((question) => question.senderType !== 'customer' && !question.readAt)
        return <button className={activeKey === key ? 'active' : ''} onClick={() => setSelectedKey(key)} key={key}><div className="thread-avatar"><MessageSquare size={17} /></div><div><strong>{order?.salesOrderName ?? 'General question'}</strong><span>{order ? `${order.salesOrderName} · PO ${order.customerPoNumber}` : 'General question'}</span><p>{latest.message}</p></div>{unread && <i />}</button>
      })}</aside>
      <div className="conversation"><header><div><strong>{selectedOrder?.salesOrderName ?? 'General question'}</strong><span>{selectedOrder ? `${selectedOrder.salesOrderName} · PO ${selectedOrder.customerPoNumber}` : 'General question'}</span></div></header><div className="message-stream">{selectedMessages.map((question) => {
        const own = question.senderType === 'customer'
        return <div className={`message-bubble ${own ? 'own' : ''}`} key={question.id}><span>{question.message}</span><small>{formatDateTime(question.createdAt)} {own && <CheckCheck size={13} />}</small></div>
      })}</div><div className="message-compose portal-preview-compose"><textarea aria-label="Message preview" rows={2} placeholder="Type a plain-text message…" disabled /><Button aria-label="Send message preview" disabled><Send size={18} /></Button></div></div>
    </section>}
  </>
}

function DocumentsPreview({ snapshot }: { snapshot: CustomerPortalSnapshot }) {
  const [notice, setNotice] = useState('')
  const openDocument = async (filePath: string) => {
    if (env.demoMode) {
      setNotice('Demo document metadata is present; connect Supabase Storage to download the PDF.')
      return
    }
    try { window.open(await getDocumentUrl(filePath), '_blank', 'noopener,noreferrer') }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to open the document.') }
  }

  return <>
    <PreviewHeading eyebrow="Manufacturer-managed files" title="Documents" description="Customer POs, invoice references, drawings, and other approved PDF documents." />
    <CustomerDocumentTerms />
    {notice && <div className="notice-card"><strong>{notice}</strong></div>}
    {snapshot.documents.length === 0 ? <EmptyState title="No customer documents" body="Manufacturer-uploaded PDFs will appear here." /> : <section className="invoice-grid">{snapshot.documents.map((document) => {
      const order = snapshot.salesOrders.find((candidate) => candidate.id === document.salesOrderId)
      return <article className="invoice-card" key={document.id}><div className="pdf-icon"><Files /></div><div><header><strong>{document.documentName}</strong><Badge>{documentTypeLabels[document.documentType]}</Badge></header><span>{order?.salesOrderName}</span><dl><div><dt>Document date</dt><dd>{formatDate(document.documentDate)}</dd></div>{document.documentType === 'invoice' && <div><dt>Amount</dt><dd>{document.amount == null ? '—' : money.format(document.amount)}</dd></div>}<div><dt>Sales order</dt><dd>{order?.salesOrderName ?? '—'}</dd></div></dl></div><Button variant="secondary" onClick={() => void openDocument(document.filePath)}><Download size={17} /> Download</Button></article>
    })}</section>}
  </>
}

export function CustomerPortalViewPage() {
  const { data } = useShop()
  const [requestedCustomerId, setRequestedCustomerId] = useState('')
  const [section, setSection] = useState<PreviewSection>('orders')
  const customerId = data?.customers.some((customer) => customer.id === requestedCustomerId)
    ? requestedCustomerId
    : data?.customers[0]?.id ?? ''
  const snapshot = useMemo(() => data && customerId ? customerPortalSnapshot(data, customerId) : null, [customerId, data])

  return <main className="page customer-portal-view-page">
    <PageHeader
      eyebrow="Customer validation"
      title="Customer Portal View"
      description="Preview the customer-safe portal experience without signing in as the customer."
      action={data && data.customers.length > 0 ? <label className="portal-preview-customer">Customer<select value={customerId} onChange={(event) => setRequestedCustomerId(event.target.value)}>{data.customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.customerName}</option>)}</select></label> : undefined}
    />
    {!snapshot ? <EmptyState title="No customers to preview" body="Create a customer account to validate its portal view." /> : <>
      <div className="portal-preview-notice"><Eye /><div><strong>Read-only manufacturer preview</strong><span>Showing only the orders, customer-facing production stages, questions, and documents available to {snapshot.customer?.customerName}.</span></div></div>
      <section className="portal-preview-frame">
        <header className="portal-preview-frame-header"><div><strong>{data?.organization.name}</strong><span>Customer portal</span></div><Badge tone="blue">Preview</Badge></header>
        <nav className="portal-preview-nav" aria-label="Customer portal preview sections">{previewSections.map(({ id, label, icon: Icon }) => <button className={section === id ? 'active' : ''} onClick={() => setSection(id)} aria-current={section === id ? 'page' : undefined} key={id}><Icon size={17} /><span>{label}</span></button>)}</nav>
        <div className="portal-preview-content">
          {section === 'orders' && <><PreviewHeading eyebrow="Customer portal" title={`Welcome, ${snapshot.customer?.customerName}`} description="A clear view of accepted orders and current production progress." /><PortalOrdersView snapshot={snapshot} /></>}
          {section === 'questions' && <QuestionsPreview snapshot={snapshot} />}
          {section === 'documents' && <DocumentsPreview snapshot={snapshot} />}
        </div>
      </section>
    </>}
  </main>
}
