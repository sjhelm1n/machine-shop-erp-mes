import { Archive, ArchiveRestore, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import { Badge, Button, EmptyState, Modal, PageHeader } from '../components/Ui'
import { useShop } from '../context/ShopContext'
import type { RoutingTemplate } from '../domain/types'
import { moveRoutingDraft } from '../domain/routingOrder'

type DraftStep = { key: string; name: string; stage: string; instructions: string }

const blankStep = (): DraftStep => ({ key: crypto.randomUUID(), name: '', stage: 'In production', instructions: '' })

export function RoutingTemplatesPage() {
  const { data, saveRoutingTemplate, setRoutingTemplateArchived } = useShop()
  const [showArchived, setShowArchived] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [templateId, setTemplateId] = useState<string>(() => crypto.randomUUID())
  const [editing, setEditing] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [steps, setSteps] = useState<DraftStep[]>([blankStep()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [archiveBusyId, setArchiveBusyId] = useState<string | null>(null)
  const [draggedKey, setDraggedKey] = useState<string | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)

  if (!data) return null
  const templates = data.routingTemplates.filter((template) => Boolean(template.archivedAt) === showArchived)

  const openCreate = () => {
    setTemplateId(crypto.randomUUID())
    setEditing(false)
    setTemplateName('')
    setSteps([blankStep()])
    setError('')
    setEditorOpen(true)
  }
  const openEdit = (template: RoutingTemplate) => {
    setTemplateId(template.id)
    setEditing(true)
    setTemplateName(template.templateName)
    setSteps(template.steps.map((step) => ({ key: step.id, name: step.routingStepName, stage: step.customerStageName, instructions: step.workInstructions })))
    setError('')
    setEditorOpen(true)
  }
  const moveByOffset = (key: string, offset: -1 | 1) => setSteps((current) => {
    const index = current.findIndex((step) => step.key === key)
    return moveRoutingDraft(current, key, index + offset)
  })
  const startDrag = (event: DragEvent<HTMLButtonElement>, key: string) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', key)
    setDraggedKey(key)
  }
  const drop = (event: DragEvent<HTMLDivElement>, targetKey: string) => {
    event.preventDefault()
    const sourceKey = draggedKey ?? event.dataTransfer.getData('text/plain')
    setSteps((current) => moveRoutingDraft(current, sourceKey, current.findIndex((step) => step.key === targetKey)))
    setDraggedKey(null)
    setDropKey(null)
  }
  const handleOrderKey = (event: KeyboardEvent<HTMLButtonElement>, key: string) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    moveByOffset(key, event.key === 'ArrowUp' ? -1 : 1)
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await saveRoutingTemplate({
        id: templateId,
        organizationId: data.organization.id,
        templateName,
        steps: steps.map((step) => ({ name: step.name, customerStageName: step.stage, instructions: step.instructions })),
      })
      setEditorOpen(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save the routing template.')
    } finally {
      setBusy(false)
    }
  }
  const toggleArchived = async (template: RoutingTemplate) => {
    const archived = !template.archivedAt
    if (archived && !window.confirm(`Archive “${template.templateName}”? Existing work orders will not be affected.`)) return
    setArchiveBusyId(template.id)
    try { await setRoutingTemplateArchived(template.id, archived) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update the routing template.') }
    finally { setArchiveBusyId(null) }
  }

  return <main className="page">
    <PageHeader eyebrow="Production setup" title="Routing templates" description="Save common in-plant routes, then copy one into a new work order and adjust that work order as needed." action={<Button onClick={openCreate}><Plus size={17} /> New routing</Button>} />
    <div className="toolbar"><div className="segmented"><button className={!showArchived ? 'active' : ''} onClick={() => setShowArchived(false)}>Active</button><button className={showArchived ? 'active' : ''} onClick={() => setShowArchived(true)}>Archived</button></div></div>
    {error && !editorOpen && <p className="form-error">{error}</p>}
    {templates.length === 0 ? <EmptyState title={showArchived ? 'No archived routings' : 'No routing templates yet'} body={showArchived ? 'Archived routing templates will appear here.' : 'Create a routing once and reuse it when releasing work orders.'} /> : <div className="routing-template-list">{templates.map((template) => <article className="panel routing-template-card" key={template.id}>
      <header><div><h2>{template.templateName}</h2><span>{template.steps.length} step{template.steps.length === 1 ? '' : 's'}</span></div><div className="panel-actions">{template.archivedAt && <Badge>Archived</Badge>}<Button variant="secondary" disabled={Boolean(template.archivedAt) || archiveBusyId === template.id} onClick={() => openEdit(template)}><Pencil size={15} /> Edit</Button><Button variant="secondary" disabled={archiveBusyId === template.id} onClick={() => void toggleArchived(template)}>{template.archivedAt ? <ArchiveRestore size={15} /> : <Archive size={15} />}{archiveBusyId === template.id ? 'Saving…' : template.archivedAt ? 'Restore' : 'Archive'}</Button></div></header>
      <ol>{template.steps.map((step) => <li key={step.id}><span>{step.sequenceNumber}</span><div><strong>{step.routingStepName}</strong><small>{step.customerStageName}</small></div><p>{step.workInstructions || 'No work instructions'}</p></li>)}</ol>
    </article>)}</div>}
    {editorOpen && <Modal title={editing ? 'Edit routing template' : 'New routing template'} onClose={() => !busy && setEditorOpen(false)}><form className="entity-form routing-template-form" onSubmit={submit}>
      <label className="full">Template name<input autoFocus maxLength={120} value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Example: Standard mill route" required /></label>
      <div className="form-section full"><header><div><strong>Routing</strong><span id="template-routing-order-help">Drag operations to reorder them. Arrow keys also work on the drag handle.</span></div><Button type="button" variant="secondary" disabled={steps.length >= 50} onClick={() => setSteps((current) => [...current, blankStep()])}><Plus size={15} /> Add step</Button></header>{steps.map((step, index) => <div className={`route-editor${draggedKey === step.key ? ' dragging' : ''}${dropKey === step.key && draggedKey !== step.key ? ' drop-target' : ''}`} key={step.key} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropKey(step.key) }} onDrop={(event) => drop(event, step.key)}>
        <button type="button" className="route-drag-handle" draggable aria-label={`Reorder ${step.name || `step ${index + 1}`}`} aria-describedby="template-routing-order-help" title="Drag to reorder; use Up or Down arrow keys for keyboard control" onDragStart={(event) => startDrag(event, step.key)} onDragEnd={() => { setDraggedKey(null); setDropKey(null) }} onKeyDown={(event) => handleOrderKey(event, step.key)}><GripVertical size={17} /></button>
        <span className="route-sequence">{(index + 1) * 10}</span>
        <label>Internal step<input maxLength={120} value={step.name} onChange={(event) => setSteps((current) => current.map((candidate) => candidate.key === step.key ? { ...candidate, name: event.target.value } : candidate))} required /></label>
        <label>Customer stage<input maxLength={120} value={step.stage} onChange={(event) => setSteps((current) => current.map((candidate) => candidate.key === step.key ? { ...candidate, stage: event.target.value } : candidate))} required /></label>
        <label className="instruction-field">Work instructions<textarea value={step.instructions} onChange={(event) => setSteps((current) => current.map((candidate) => candidate.key === step.key ? { ...candidate, instructions: event.target.value } : candidate))} /></label>
        <button type="button" className="icon-button" aria-label={`Remove ${step.name || `step ${index + 1}`}`} disabled={steps.length === 1} onClick={() => setSteps((current) => current.filter((candidate) => candidate.key !== step.key))}><Trash2 size={16} /></button>
      </div>)}</div>
      <p className="subtle full">Template edits only affect future selections. Existing work-order routings remain unchanged.</p>
      {error && <p className="form-error full">{error}</p>}
      <div className="form-actions full"><Button type="button" variant="ghost" disabled={busy} onClick={() => setEditorOpen(false)}>Cancel</Button><Button disabled={busy}>{busy ? 'Saving…' : 'Save routing'}</Button></div>
    </form></Modal>}
  </main>
}
