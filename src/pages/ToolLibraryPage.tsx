import { Archive, ArchiveRestore, Camera, History, Pencil, Plus, Printer, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { EndMillIcon } from '../components/EndMillIcon'
import { Badge, Button, EmptyState, Modal, PageHeader } from '../components/Ui'
import { useShop } from '../context/ShopContext'
import { calculateStepMetrics } from '../domain/routing'
import type { ToolAssembly } from '../domain/types'
import { formatDateTime } from '../lib/format'

const blankForm = { id: '', name: '', description: '' }
type ToolFilter = 'active' | 'all' | 'archived'

function ToolPhoto({ tool }: { tool: ToolAssembly }) {
  return tool.imageUrl
    ? <img src={tool.imageUrl} alt={`${tool.assemblyNumber} tool assembly`} />
    : <EndMillIcon aria-hidden="true" />
}

export function ToolLibraryPage() {
  const { toolAssemblyId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data, loading, loadMore, saveToolAssembly, uploadToolAssemblyImage, removeToolAssemblyImage, setToolAssemblyArchived, recordToolCheckout } = useShop()
  const quickImageInput = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ToolFilter>('active')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(blankForm)
  const [formImage, setFormImage] = useState<File | null>(null)
  const [formImagePreview, setFormImagePreview] = useState<string | null>(null)
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null)
  const [transaction, setTransaction] = useState<{ type: 'CHECK_OUT' | 'CHECK_IN'; note: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selected = data?.toolAssemblies.find((tool) => tool.id === toolAssemblyId) ?? null
  const editedTool = data?.toolAssemblies.find((tool) => tool.id === form.id) ?? null

  useEffect(() => {
    if (toolAssemblyId && data && !selected) navigate('/app/tools', { replace: true })
  }, [data, navigate, selected, toolAssemblyId])

  useEffect(() => {
    if (!selected || searchParams.get('action') !== 'checkout') return
    setSearchParams({}, { replace: true })
    setError('')
    if (selected.quantityCheckedOut === 0) setTransaction({ type: 'CHECK_OUT', note: '' })
    else setError(`${selected.assemblyNumber} is already checked out.`)
  }, [searchParams, selected, setSearchParams])

  useEffect(() => {
    if (!formImage) { setFormImagePreview(null); return }
    const preview = URL.createObjectURL(formImage)
    setFormImagePreview(preview)
    return () => URL.revokeObjectURL(preview)
  }, [formImage])

  const filtered = useMemo(() => {
    if (!data) return []
    const normalized = query.trim().toLowerCase()
    return data.toolAssemblies.filter((tool) => {
      const matchesFilter = filter === 'all' || (filter === 'archived' ? Boolean(tool.archivedAt) : !tool.archivedAt)
      return matchesFilter && (!normalized || `${tool.assemblyNumber} ${tool.name} ${tool.description}`.toLowerCase().includes(normalized))
    })
  }, [data, filter, query])

  if (!data) return null
  const history = selected ? data.toolCheckoutTransactions.filter((row) => row.toolAssemblyId === selected.id) : []
  const currentUsage = selected ? data.workOrders.flatMap((workOrder) => {
    if (workOrder.archivedAt || workOrder.completionDate) return []
    const metrics = calculateStepMetrics(workOrder, data.productionEvents)
    return (workOrder.operationTooling ?? []).flatMap((assignment) => {
      if (assignment.toolAssemblyId !== selected.id) return []
      const metric = metrics.find((candidate) => candidate.stepId === assignment.workOrderOperationId)
      const operation = workOrder.routing.find((candidate) => candidate.id === assignment.workOrderOperationId)
      return metric?.startedAt && !metric.completedAt && operation ? [{ workOrder, operation, assignment }] : []
    })
  }) : []

  const openCreate = () => { setForm({ ...blankForm, id: crypto.randomUUID() }); setFormImage(null); setError(''); setFormOpen(true) }
  const openEdit = (tool: ToolAssembly) => { setForm({ id: tool.id, name: tool.name, description: tool.description }); setFormImage(null); setError(''); setFormOpen(true) }
  const submitTool = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await saveToolAssembly({ id: form.id, organizationId: data.organization.id, name: form.name, description: form.description })
      if (formImage) await uploadToolAssemblyImage(form.id, data.organization.id, formImage)
      setFormOpen(false); setFormImage(null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save the tool assembly.') }
    finally { setBusy(false) }
  }
  const submitTransaction = async (event: FormEvent) => {
    event.preventDefault(); if (!selected || !transaction) return; setBusy(true); setError('')
    try { await recordToolCheckout({ toolAssemblyId: selected.id, transactionType: transaction.type, note: transaction.note }); setTransaction(null) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to record the tooling transaction.') }
    finally { setBusy(false) }
  }
  const toggleArchive = async (tool: ToolAssembly) => {
    const archived = !tool.archivedAt
    if (archived && !window.confirm(`Archive ${tool.assemblyNumber}? Historical assignments and checkout transactions will remain visible.`)) return
    setBusy(true); setError('')
    try { await setToolAssemblyArchived(tool.id, archived) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update the tool assembly.') }
    finally { setBusy(false) }
  }
  const printLabel = async (tool: ToolAssembly) => {
    const { generateToolAssemblyLabel } = await import('../services/toolLabelPdf')
    await generateToolAssemblyLabel(tool)
  }
  const beginImageUpload = (tool: ToolAssembly) => {
    if (tool.archivedAt || busy) return
    setUploadTargetId(tool.id); setError(''); quickImageInput.current?.click()
  }
  const uploadQuickImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    const tool = data.toolAssemblies.find((candidate) => candidate.id === uploadTargetId)
    if (!file || !tool) return
    setBusy(true); setError('')
    try { await uploadToolAssemblyImage(tool.id, tool.organizationId, file) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to upload the tool image.') }
    finally { setBusy(false); setUploadTargetId(null) }
  }
  const removeImage = async (tool: ToolAssembly) => {
    if (!tool.imagePath || !window.confirm(`Remove the image from ${tool.assemblyNumber}?`)) return
    setBusy(true); setError('')
    try { await removeToolAssemblyImage(tool.id, tool.imagePath) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to remove the tool image.') }
    finally { setBusy(false) }
  }

  return <main className="page tool-library-page">
    <PageHeader eyebrow="Shop tooling" title="Tool Library" description="Complete usable tool assemblies, physical crib checkout, and current operation usage." action={<Button onClick={openCreate}><Plus size={17} /> New tool assembly</Button>} />
    <input ref={quickImageInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => void uploadQuickImage(event)} />
    <div className="toolbar tool-toolbar"><label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tool assembly, name, or description..." />{query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button> : null}</label><div className="segmented"><button className={filter === 'active' ? 'active' : ''} onClick={() => setFilter('active')}>Active</button><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button><button className={filter === 'archived' ? 'active' : ''} onClick={() => setFilter('archived')}>Archived</button></div></div>
    {error && !formOpen && !transaction ? <p className="form-error">{error}</p> : null}
    {filtered.length === 0 ? <EmptyState title={filter === 'archived' ? 'No archived tool assemblies' : 'No matching tool assemblies'} body={query ? 'Clear or change the search.' : 'Create a complete tool assembly to begin tracking shop tooling.'} /> : <section className="table-card tool-library-table"><table><thead><tr><th>Tool assembly ID</th><th>Name</th><th>Description</th><th>Checked out</th><th>In use</th><th>Future</th><th>Status</th><th aria-label="Actions" /></tr></thead><tbody>{filtered.map((tool) => <tr className={tool.usageWarning ? 'tool-warning-row' : undefined} key={tool.id}>
      <td><div className="tool-table-identity"><button className="tool-thumbnail-button" type="button" disabled={Boolean(tool.archivedAt) || busy} onClick={() => beginImageUpload(tool)} aria-label={`${tool.imageUrl ? 'Replace' : 'Upload'} image for ${tool.assemblyNumber}`}><ToolPhoto tool={tool} /><span><Camera size={13} /></span></button><div><Link className="table-primary" to={`/app/tools/${tool.id}`}>{tool.assemblyNumber}</Link><small>{tool.imageUrl ? 'Click photo to replace' : 'Add assembly photo'}</small></div></div></td>
      <td><strong>{tool.name}</strong></td><td className="tool-description-cell">{tool.description || '—'}</td><td>{tool.quantityCheckedOut ? 'Yes' : 'No'}</td><td>{tool.quantityInUse ? 'Yes' : 'No'}</td><td>{tool.futureRequirements ? 'Yes' : 'No'}</td>
      <td>{tool.archivedAt ? <Badge>Archived</Badge> : tool.usageWarning ? <Badge tone="red">Simultaneous-use conflict</Badge> : <Badge tone="green">Active</Badge>}</td>
      <td><div className="tool-row-actions"><button type="button" onClick={() => navigate(`/app/tools/${tool.id}`)} title="Details" aria-label={`View ${tool.assemblyNumber} details`}><History size={16} /></button><button type="button" onClick={() => void printLabel(tool)} title="Print label" aria-label={`Print ${tool.assemblyNumber} label`}><Printer size={16} /></button><button type="button" disabled={Boolean(tool.archivedAt)} onClick={() => openEdit(tool)} title="Edit" aria-label={`Edit ${tool.assemblyNumber}`}><Pencil size={16} /></button><button type="button" disabled={busy} onClick={() => void toggleArchive(tool)} title={tool.archivedAt ? 'Restore' : 'Archive'} aria-label={`${tool.archivedAt ? 'Restore' : 'Archive'} ${tool.assemblyNumber}`}>{tool.archivedAt ? <ArchiveRestore size={16} /> : <Archive size={16} />}</button></div></td>
    </tr>)}</tbody></table></section>}
    {data.pageInfo?.toolsHasMore ? <div className="form-actions"><Button variant="secondary" disabled={loading} onClick={() => void loadMore()}>{loading ? 'Loading…' : 'Load 100 more tool assemblies'}</Button></div> : null}
    {selected ? <Modal title={`${selected.assemblyNumber} · ${selected.name}`} onClose={() => navigate('/app/tools')}><div className="tool-detail">
      <div className="tool-detail-hero"><div className="tool-detail-image"><ToolPhoto tool={selected} /></div><div className="tool-detail-description"><strong>Description</strong><p>{selected.description || 'No description provided.'}</p></div></div>
      <div className="tool-detail-actions"><Button disabled={selected.quantityCheckedOut > 0} onClick={() => { setError(''); setTransaction({ type: 'CHECK_OUT', note: '' }) }}>Check out</Button><Button variant="secondary" disabled={selected.quantityCheckedOut === 0 || selected.quantityInUse > 0} title={selected.quantityInUse > 0 ? 'A Tool Assembly cannot be checked in while it is in use.' : undefined} onClick={() => { setError(''); setTransaction({ type: 'CHECK_IN', note: '' }) }}>Check in</Button></div>
      <section><h3>Availability</h3><dl className="tool-quantity-grid"><div><dt>Checked out</dt><dd>{selected.quantityCheckedOut ? 'Yes' : 'No'}</dd></div><div><dt>Currently in use</dt><dd>{selected.quantityInUse ? 'Yes' : 'No'}</dd></div><div><dt>Future operations</dt><dd>{selected.futureRequirements ? 'Yes' : 'No'}</dd></div></dl>{selected.quantityInUse > 0 ? <p className="subtle">Complete or undo the active operation before checking this Tool Assembly in.</p> : null}{selected.usageWarning ? <p className="form-error">This unique Tool Assembly is assigned to more than one active operation.</p> : null}</section>
      <section><h3>Current Work Order usage</h3>{currentUsage.length === 0 ? <p className="subtle">Not currently in use by an active operation.</p> : <div className="tool-current-usage">{currentUsage.map(({ workOrder, operation, assignment }) => <div key={assignment.id}><div><strong>{workOrder.workOrderName}</strong><span>{workOrder.partNumber}</span></div><div><strong>OP {operation.sequenceNumber} · {operation.routingStepName}</strong><span>{assignment.toolNumber}</span></div></div>)}</div>}</section>
      <section><h3>Recent checkout history</h3>{history.length === 0 ? <p className="subtle">No checkout transactions recorded.</p> : <div className="tool-history">{history.map((row) => <div key={row.id}><Badge tone={row.transactionType === 'CHECK_OUT' ? 'blue' : 'green'}>{row.transactionType === 'CHECK_OUT' ? 'Checked out' : 'Checked in'}</Badge><span>{row.actorDisplayName}</span><time>{formatDateTime(row.createdAt, data.organization.plantTimezone)}</time>{row.note ? <p>{row.note}</p> : null}</div>)}</div>}</section>
    </div></Modal> : null}
    {formOpen ? <Modal title={editedTool ? 'Edit tool assembly' : 'New tool assembly'} onClose={() => !busy && setFormOpen(false)}><form className="entity-form" onSubmit={submitTool}>
      <label className="full">Assembly photo<span className="tool-image-picker"><span className="tool-image-picker-preview">{formImagePreview ? <img src={formImagePreview} alt="Selected tool assembly preview" /> : editedTool?.imageUrl ? <img src={editedTool.imageUrl} alt={`${editedTool.assemblyNumber} tool assembly`} /> : <EndMillIcon aria-hidden="true" />}</span><span><strong>{formImage ? formImage.name : editedTool?.imageUrl ? 'Current assembly image' : 'Add an assembly image'}</strong><small>JPG, PNG, or WebP · 5 MB maximum</small><input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => setFormImage(event.target.files?.[0] ?? null)} /></span></span></label>
      {editedTool?.imagePath && !formImage ? <div className="full"><Button type="button" variant="ghost" disabled={busy} onClick={() => void removeImage(editedTool)}><Trash2 size={15} /> Remove current image</Button></div> : null}
      <label>Tool assembly ID<input value={editedTool?.assemblyNumber ?? 'Assigned automatically when saved'} readOnly aria-readonly="true" /></label>
      <label className="full">Name<input autoFocus maxLength={240} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Defaults to the Tool Assembly ID" /></label>
      <label className="full">Description<textarea maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      {error ? <p className="form-error full">{error}</p> : null}<div className="form-actions full"><Button type="button" variant="ghost" disabled={busy} onClick={() => setFormOpen(false)}>Cancel</Button><Button disabled={busy}>{busy ? 'Saving…' : 'Save tool assembly'}</Button></div>
    </form></Modal> : null}
    {selected && transaction ? <Modal title={transaction.type === 'CHECK_OUT' ? `Check out ${selected.assemblyNumber}` : `Check in ${selected.assemblyNumber}`} onClose={() => !busy && setTransaction(null)}><form className="entity-form" onSubmit={submitTransaction}><label className="full">Note (optional)<textarea autoFocus maxLength={500} value={transaction.note} onChange={(event) => setTransaction({ ...transaction, note: event.target.value })} /></label><p className="subtle full">This records physical crib movement for this unique Tool Assembly. It does not reserve it for a Work Order.</p>{error ? <p className="form-error full">{error}</p> : null}<div className="form-actions full"><Button type="button" variant="ghost" disabled={busy} onClick={() => setTransaction(null)}>Cancel</Button><Button disabled={busy}>{busy ? 'Saving…' : transaction.type === 'CHECK_OUT' ? 'Check out' : 'Check in'}</Button></div></form></Modal> : null}
  </main>
}
