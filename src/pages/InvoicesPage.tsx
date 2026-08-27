import { Download, FileText, Plus, Upload } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Badge, Button, EmptyState, Modal, PageHeader } from '../components/Ui'
import { useAuth } from '../context/AuthContext'
import { useShop } from '../context/ShopContext'
import { env } from '../lib/env'
import { formatDate, money } from '../lib/format'
import { getInvoiceUrl, uploadInvoice } from '../services/shopService'

export function InvoicesPage() {
  const { data, refresh } = useShop()
  const { profile } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ customerId: '', salesOrderId: '', invoiceNumber: '', invoiceDate: new Date().toISOString().slice(0, 10), amount: '' })
  const invoices = data?.invoices.filter((invoice) => profile?.role === 'manufacturer' || invoice.customerId === profile?.customerId) ?? []
  const openInvoice = async (filePath: string) => { if (env.demoMode) { setNotice('Demo invoice metadata is present; connect Supabase Storage to download the PDF.'); return } window.open(await getInvoiceUrl(filePath), '_blank', 'noopener,noreferrer') }
  const chooseFile = (nextFile: File | undefined) => { if (!nextFile) return; if (nextFile.type !== 'application/pdf' || !nextFile.name.toLowerCase().endsWith('.pdf')) { setNotice('Only PDF files can be uploaded.'); return } setFile(nextFile); setForm({ customerId: '', salesOrderId: '', invoiceNumber: nextFile.name.replace(/\.pdf$/i, ''), invoiceDate: new Date().toISOString().slice(0, 10), amount: '' }); setNotice('') }
  return <main className="page">
    <PageHeader eyebrow="QuickBooks archive" title="Invoices" description="PDF reference copies only. QuickBooks Online remains the financial system of record." action={profile?.role === 'manufacturer' ? <><input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => chooseFile(event.target.files?.[0])} /><Button onClick={() => fileRef.current?.click()}><Plus size={17} /> Upload invoice</Button></> : undefined} />
    {notice && <div className="notice-card"><strong>{notice}</strong></div>}
    {invoices.length === 0 ? <EmptyState title="No invoice PDFs" body="Invoices uploaded for completed orders will appear here." /> : <section className="invoice-grid">{invoices.map((invoice) => {
      const order = data?.salesOrders.find((candidate) => candidate.id === invoice.salesOrderId)
      const customer = data?.customers.find((candidate) => candidate.id === invoice.customerId)
      return <article className="invoice-card" key={invoice.id}><div className="pdf-icon"><FileText /></div><div><header><strong>{invoice.invoiceNumber}</strong><Badge>PDF</Badge></header><span>{profile?.role === 'manufacturer' ? customer?.customerName : order?.salesOrderNumber}</span><dl><div><dt>Invoice date</dt><dd>{formatDate(invoice.invoiceDate)}</dd></div><div><dt>Amount</dt><dd>{invoice.amount == null ? '—' : money.format(invoice.amount)}</dd></div><div><dt>Sales order</dt><dd>{order?.salesOrderNumber ?? '—'}</dd></div></dl></div><Button variant="secondary" onClick={() => void openInvoice(invoice.filePath)}><Download size={17} /> Download</Button></article>
    })}</section>}
    {profile?.role === 'manufacturer' && <div className="upload-guidance"><Upload /><div><strong>PDF uploads are private</strong><p>Files are stored in a non-public Supabase bucket. Signed URLs expire after 60 seconds and RLS limits every document by organization and customer.</p></div></div>}
    {file && data && profile?.role === 'manufacturer' && <Modal title="Archive invoice PDF" onClose={() => setFile(null)}><form className="entity-form" onSubmit={async (event: FormEvent) => { event.preventDefault(); setBusy(true); setNotice(''); try { if (env.demoMode) { setNotice(`Demo upload ready: ${file.name}. Connect Supabase to persist it.`) } else { await uploadInvoice(file, { organizationId: data.organization.id, customerId: form.customerId, salesOrderId: form.salesOrderId || null, invoiceNumber: form.invoiceNumber, invoiceDate: form.invoiceDate, amount: form.amount ? Number(form.amount) : null }); await refresh(); setNotice('Invoice archived') } setFile(null) } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to upload invoice.') } finally { setBusy(false) } }}>
      <div className="file-selection full"><FileText /><div><strong>{file.name}</strong><span>{Math.ceil(file.size / 1024)} KB · PDF</span></div></div>
      <label>Customer<select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value, salesOrderId: '' })} required><option value="">Choose customer</option>{data.customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.customerName}</option>)}</select></label>
      <label>Sales order<select value={form.salesOrderId} onChange={(event) => setForm({ ...form, salesOrderId: event.target.value })}><option value="">Not linked</option>{data.salesOrders.filter((order) => order.customerId === form.customerId).map((order) => <option value={order.id} key={order.id}>{order.salesOrderNumber}</option>)}</select></label>
      <label>Invoice #<input value={form.invoiceNumber} onChange={(event) => setForm({ ...form, invoiceNumber: event.target.value })} required /></label>
      <label>Invoice date<input type="date" value={form.invoiceDate} onChange={(event) => setForm({ ...form, invoiceDate: event.target.value })} required /></label>
      <label>Amount (optional)<input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
      <div className="form-actions full"><Button type="button" variant="ghost" onClick={() => setFile(null)}>Cancel</Button><Button disabled={busy}>{busy ? 'Uploading…' : 'Archive PDF'}</Button></div>
    </form></Modal>}
  </main>
}
