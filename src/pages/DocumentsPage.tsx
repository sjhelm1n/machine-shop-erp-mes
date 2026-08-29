import { Download, ExternalLink, FileSearch, FileText, LoaderCircle, Plus, ShieldCheck, Upload, X } from 'lucide-react'
import { type FormEvent, useMemo, useRef, useState } from 'react'
import { Badge, Button, EmptyState, Modal, PageHeader } from '../components/Ui'
import { CustomerDocumentTerms } from '../components/CustomerDocumentTerms'
import { useAuth } from '../context/AuthContext'
import { useShop } from '../context/ShopContext'
import { documentTypeLabels, filterDocuments } from '../domain/documentFilters'
import { validateDocumentPdf } from '../domain/documentSecurity'
import type { CustomerDocument, CustomerDocumentType } from '../domain/types'
import { env } from '../lib/env'
import { calendarDateInTimeZone, formatDate, money } from '../lib/format'
import { getDocumentUrl, uploadDocument } from '../services/shopService'

const documentTypes = Object.entries(documentTypeLabels) as Array<[CustomerDocumentType, string]>
export function DocumentsPage() {
  const { data, loading, loadMore, refresh } = useShop()
  const { profile } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [salesOrderFilter, setSalesOrderFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<CustomerDocumentType | ''>('')
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ documentName: string; url: string } | null>(null)
  const [attested, setAttested] = useState(false)
  const [form, setForm] = useState({ customerId: '', salesOrderId: '', documentType: 'customer_po' as CustomerDocumentType, documentName: '', documentDate: '', amount: '' })

  const accessibleDocuments = useMemo(() => data?.documents.filter((document) => profile?.role === 'manufacturer' || document.customerId === profile?.customerId) ?? [], [data?.documents, profile?.customerId, profile?.role])
  const customerOptions = useMemo(() => {
    const customerIds = new Set(accessibleDocuments.map((document) => document.customerId))
    return data?.customers.filter((customer) => customerIds.has(customer.id)) ?? []
  }, [accessibleDocuments, data?.customers])
  const salesOrderOptions = useMemo(() => {
    const salesOrderIds = new Set(accessibleDocuments.flatMap((document) => document.salesOrderId ? [document.salesOrderId] : []))
    return data?.salesOrders.filter((order) => salesOrderIds.has(order.id) && (!customerFilter || order.customerId === customerFilter)) ?? []
  }, [accessibleDocuments, customerFilter, data?.salesOrders])
  const activeSalesOrderFilter = salesOrderFilter && salesOrderOptions.some((order) => order.id === salesOrderFilter) ? salesOrderFilter : ''
  const documents = useMemo(() => filterDocuments(accessibleDocuments, { customerId: customerFilter, salesOrderId: activeSalesOrderFilter, documentType: typeFilter }), [accessibleDocuments, activeSalesOrderFilter, customerFilter, typeFilter])
  const customerById = useMemo(() => new Map(data?.customers.map((customer) => [customer.id, customer]) ?? []), [data?.customers])
  const salesOrderById = useMemo(() => new Map(data?.salesOrders.map((order) => [order.id, order]) ?? []), [data?.salesOrders])
  const filtered = Boolean(customerFilter || activeSalesOrderFilter || typeFilter)

  const getUrl = async (filePath: string) => {
    if (env.demoMode) { setNotice('Demo document metadata is present; connect Supabase Storage to preview or download the PDF.'); return null }
    try { return await getDocumentUrl(filePath) }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to open the document PDF.'); return null }
  }
  const openDocument = async (filePath: string) => { const url = await getUrl(filePath); if (url) window.open(url, '_blank', 'noopener,noreferrer') }
  const previewDocument = async (document: CustomerDocument) => {
    setPreviewingId(document.id)
    setNotice('')
    const url = await getUrl(document.filePath)
    if (url) setPreview({ documentName: document.documentName, url })
    setPreviewingId(null)
  }
  const chooseFile = async (nextFile: File | undefined) => {
    if (!nextFile) return
    try {
      await validateDocumentPdf(nextFile)
      setFile(nextFile)
      setAttested(false)
      setForm({ customerId: '', salesOrderId: '', documentType: 'customer_po', documentName: nextFile.name.replace(/\.pdf$/i, ''), documentDate: data ? calendarDateInTimeZone(data.organization.plantTimezone) : '', amount: '' })
      setNotice('')
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Unable to inspect the selected PDF.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return <main className="page">
    <PageHeader eyebrow="Customer portal files" title="Document storage" description="Manufacturer-managed PDF references for customer POs, invoices, drawings, and other approved documents." action={profile?.role === 'manufacturer' ? <><input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => void chooseFile(event.target.files?.[0])} /><Button onClick={() => fileRef.current?.click()}><Plus size={17} /> Upload document</Button></> : undefined} />
    {notice && <div className="notice-card"><strong>{notice}</strong></div>}
    {profile?.role === 'customer' && <CustomerDocumentTerms />}
    {accessibleDocuments.length > 0 && <div className="toolbar invoice-filter-toolbar"><div className="invoice-filter-fields">
      {profile?.role === 'manufacturer' && <label>Customer<select value={customerFilter} onChange={(event) => { setCustomerFilter(event.target.value); setSalesOrderFilter('') }}><option value="">All customers</option>{customerOptions.map((customer) => <option value={customer.id} key={customer.id}>{customer.customerName}</option>)}</select></label>}
      <label>Customer PO #<select value={activeSalesOrderFilter} onChange={(event) => setSalesOrderFilter(event.target.value)}><option value="">All PO numbers</option>{salesOrderOptions.map((order) => <option value={order.id} key={order.id}>{order.customerPoNumber} · {order.salesOrderName}</option>)}</select></label>
      <label>Document type<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as CustomerDocumentType | '')}><option value="">All types</option>{documentTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    </div>{filtered && <Button variant="ghost" onClick={() => { setCustomerFilter(''); setSalesOrderFilter(''); setTypeFilter('') }}><X size={15} /> Clear filters</Button>}</div>}
    {documents.length === 0 ? <EmptyState title={filtered ? 'No matching documents' : 'No customer documents'} body={filtered ? 'Clear or change the customer, PO, or type filters.' : 'Manufacturer-uploaded customer PDFs will appear here.'} /> : <section className="invoice-grid">{documents.map((document) => {
      const order = document.salesOrderId ? salesOrderById.get(document.salesOrderId) : undefined
      const customer = customerById.get(document.customerId)
      return <article className="invoice-card" key={document.id}><button type="button" className="pdf-icon pdf-preview-button" aria-label={`Preview ${documentTypeLabels[document.documentType]} ${document.documentName}`} title="Preview PDF" disabled={previewingId !== null} onClick={() => void previewDocument(document)}>{previewingId === document.id ? <LoaderCircle className="spin" /> : <FileSearch />}</button><div><header><strong>{document.documentName}</strong><Badge>{documentTypeLabels[document.documentType]}</Badge></header><span>{profile?.role === 'manufacturer' ? customer?.customerName : order?.salesOrderName}</span><dl><div><dt>Document date</dt><dd>{formatDate(document.documentDate)}</dd></div>{document.documentType === 'invoice' && <div><dt>Amount</dt><dd>{document.amount == null ? '—' : money.format(document.amount)}</dd></div>}<div><dt>Customer PO</dt><dd>{order?.customerPoNumber ?? '—'}</dd></div><div><dt>Sales order</dt><dd>{order?.salesOrderName ?? '—'}</dd></div></dl></div><Button variant="secondary" onClick={() => void openDocument(document.filePath)}><Download size={17} /> Download</Button></article>
    })}</section>}
    {data?.pageInfo?.documentsHasMore && <div className="form-actions"><Button variant="secondary" disabled={loading} onClick={() => void loadMore()}>{loading ? 'Loading…' : 'Load 100 more documents'}</Button></div>}
    {profile?.role === 'manufacturer' && <section className="document-safety-grid" aria-label="Document upload safeguards and portal terms">
      <div className="upload-guidance"><Upload /><div><strong>Manufacturer-only, private PDF uploads</strong><p>Files stay in a non-public bucket, links expire after 60 seconds, and RLS limits each document by organization and customer. PDF signature and active-content checks provide an additional upload safeguard.</p></div></div>
      <article className="portal-terms"><header><ShieldCheck /><div><strong>Portal document terms</strong><span>Operational terms — legal review recommended</span></div></header><p>By using document storage, the manufacturer is responsible for uploading only authorized customer-facing PDFs, choosing the correct customer and order, and excluding executable code, scripts, embedded files, malware, or another customer’s information. Documents are reference copies; QuickBooks remains the accounting system of record for invoices.</p><p>These operational terms are a product safeguard, not a substitute for your company’s counsel-approved portal terms, privacy policy, retention policy, or malware-scanning process.</p></article>
    </section>}
    {file && data && profile?.role === 'manufacturer' && <Modal title="Upload customer document" onClose={() => setFile(null)}><form className="entity-form" onSubmit={async (event: FormEvent) => {
      event.preventDefault()
      if (!attested) { setNotice('Confirm the upload attestation before uploading.'); return }
      setBusy(true)
      setNotice('')
      try {
        if (env.demoMode) setNotice(`Demo upload ready: ${file.name}. Connect Supabase to persist it.`)
        else {
          await uploadDocument(file, { organizationId: data.organization.id, customerId: form.customerId, salesOrderId: form.salesOrderId || null, documentType: form.documentType, documentName: form.documentName, documentDate: form.documentDate, amount: form.documentType === 'invoice' && form.amount ? Number(form.amount) : null })
          await refresh()
          setNotice('Document uploaded')
        }
        setFile(null)
      } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to upload document.') }
      finally { setBusy(false) }
    }}>
      <div className="file-selection full"><FileText /><div><strong>{file.name}</strong><span>{Math.ceil(file.size / 1024)} KB · PDF</span></div></div>
      <label>Document type<select value={form.documentType} onChange={(event) => setForm({ ...form, documentType: event.target.value as CustomerDocumentType, amount: '' })} required>{documentTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>Customer<select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value, salesOrderId: '' })} required><option value="">Choose customer</option>{data.customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.customerName}</option>)}</select></label>
      <label>Sales order / customer PO<select value={form.salesOrderId} onChange={(event) => setForm({ ...form, salesOrderId: event.target.value })}><option value="">Not linked</option>{data.salesOrders.filter((order) => order.customerId === form.customerId).map((order) => <option value={order.id} key={order.id}>{order.salesOrderName} · PO {order.customerPoNumber}</option>)}</select></label>
      <label>{documentTypeLabels[form.documentType]} name / number<input value={form.documentName} maxLength={200} onChange={(event) => setForm({ ...form, documentName: event.target.value })} required /></label>
      <label>Document date<input type="date" value={form.documentDate} onChange={(event) => setForm({ ...form, documentDate: event.target.value })} required /></label>
      {form.documentType === 'invoice' && <label>Amount (optional)<input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>}
      <label className="upload-attestation full"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} required /><span>I confirm I am authorized to share this PDF with the selected customer, it is assigned to the correct customer/order, and it contains no executable code, scripts, embedded files, malware, or another customer’s information.</span></label>
      <div className="form-actions full"><Button type="button" variant="ghost" onClick={() => setFile(null)}>Cancel</Button><Button disabled={busy || !attested}>{busy ? 'Uploading…' : 'Upload PDF'}</Button></div>
    </form></Modal>}
    {preview && <Modal title={`Preview ${preview.documentName}`} onClose={() => setPreview(null)}><div className="invoice-preview"><iframe src={preview.url} title={`PDF preview for ${preview.documentName}`} /><footer><span>Private preview link expires after 60 seconds.</span><Button variant="secondary" onClick={() => window.open(preview.url, '_blank', 'noopener,noreferrer')}><ExternalLink size={16} /> Open in new tab</Button></footer></div></Modal>}
  </main>
}
