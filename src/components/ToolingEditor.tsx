import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { ToolingDraft } from '../domain/tooling'
import { selectableToolAssemblies } from '../domain/tooling'
import type { ToolAssembly } from '../domain/types'
import { Button } from './Ui'

interface ToolingEditorProps {
  rows: ToolingDraft[]
  toolAssemblies: ToolAssembly[]
  onChange: (rows: ToolingDraft[]) => void
  idPrefix: string
  disabled?: boolean
}

export function ToolingEditor({ rows, toolAssemblies, onChange, idPrefix, disabled = false }: ToolingEditorProps) {
  const firstActiveAssembly = toolAssemblies.find((assembly) => !assembly.archivedAt)
  const update = (key: string, values: Partial<ToolingDraft>) => onChange(rows.map((row) => row.key === key ? { ...row, ...values } : row))
  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset
    if (target < 0 || target >= rows.length) return
    const reordered = [...rows]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    onChange(reordered)
  }
  const add = () => onChange([...rows, {
    key: crypto.randomUUID(),
    toolAssemblyId: firstActiveAssembly?.id ?? '',
    toolNumber: '',
    notes: '',
  }])

  return <div className="tooling-editor">
    <header>
      <div><strong>Tooling</strong><span>Assign complete assemblies and their CNC program tool numbers.</span></div>
      <Button type="button" variant="secondary" disabled={disabled || !firstActiveAssembly} onClick={add}><Plus size={14} /> Add tool</Button>
    </header>
    {rows.length === 0 ? <p className="tooling-editor-empty">No tooling assigned.</p> : <div className="tooling-editor-list">{rows.map((row, index) => <div className="tooling-editor-row" key={row.key}>
      <label htmlFor={`${idPrefix}-assembly-${row.key}`}>Tool assembly<select id={`${idPrefix}-assembly-${row.key}`} value={row.toolAssemblyId} disabled={disabled} onChange={(event) => update(row.key, { toolAssemblyId: event.target.value })} required>
        <option value="">Select assembly</option>
        {selectableToolAssemblies(toolAssemblies, new Set([row.toolAssemblyId])).map((assembly) => <option value={assembly.id} key={assembly.id} disabled={Boolean(assembly.archivedAt)}>{assembly.assemblyNumber} · {assembly.name}{assembly.archivedAt ? ' (Archived)' : ''}</option>)}
      </select>{toolAssemblies.find((assembly) => assembly.id === row.toolAssemblyId)?.description ? <span className="tool-assembly-description"><strong>Assembly description:</strong> {toolAssemblies.find((assembly) => assembly.id === row.toolAssemblyId)!.description}</span> : null}</label>
      <label htmlFor={`${idPrefix}-number-${row.key}`}>Tool number<input id={`${idPrefix}-number-${row.key}`} value={row.toolNumber} disabled={disabled} maxLength={5} pattern="T[0-9]{1,4}" placeholder="T01" title="Use CNC notation such as T01, T1, or T12" onChange={(event) => update(row.key, { toolNumber: event.target.value.toUpperCase().replace(/\s/g, '') })} required /></label>
      <label htmlFor={`${idPrefix}-notes-${row.key}`}>Notes<input id={`${idPrefix}-notes-${row.key}`} value={row.notes} disabled={disabled} maxLength={500} placeholder="Optional" onChange={(event) => update(row.key, { notes: event.target.value })} /></label>
      <div className="tooling-editor-actions">
        <button type="button" className="icon-button" disabled={disabled || index === 0} aria-label={`Move tool ${index + 1} up`} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
        <button type="button" className="icon-button" disabled={disabled || index === rows.length - 1} aria-label={`Move tool ${index + 1} down`} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
        <button type="button" className="icon-button" disabled={disabled} aria-label={`Remove tool ${index + 1}`} onClick={() => onChange(rows.filter((candidate) => candidate.key !== row.key))}><Trash2 size={14} /></button>
      </div>
    </div>)}</div>}
    {!firstActiveAssembly && rows.length === 0 && <p className="tooling-editor-empty">Create an active Tool Assembly in the Tool Library before assigning tooling.</p>}
  </div>
}
