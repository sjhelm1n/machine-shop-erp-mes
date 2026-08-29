import jsPDF from 'jspdf'
import QRCode from 'qrcode'
import type { SalesOrder, WorkOrder, WorkOrderOperationTool } from '../domain/types'
import { formatDate } from '../lib/format'

const margin = 14
const lineHeight = 4.2
const toolingLineHeight = 3.6
const toolNumberWidth = 32
const toolAssemblyWidth = 30

const toolNumberCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function toolingForOperation(
  operationId: string,
  assignments: readonly WorkOrderOperationTool[] = [],
): WorkOrderOperationTool[] {
  return assignments
    .filter((assignment) => assignment.workOrderOperationId === operationId)
    .sort((left, right) => toolNumberCollator.compare(left.toolNumber, right.toolNumber)
      || left.sequenceNumber - right.sequenceNumber
      || left.toolAssemblyNumber.localeCompare(right.toolAssemblyNumber))
}

export async function generateTravelerPdf(workOrder: WorkOrder, salesOrder: SalesOrder): Promise<void> {
  const pdf = new jsPDF({ unit: 'mm', format: 'letter' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const contentWidth = pageWidth - margin * 2
  const bottom = pageHeight - 14
  const generatedAt = new Date().toLocaleString()
  let y = 0
  let pageNumber = 0

  const wrap = (value: string, width: number): string[] => value.split(/\r?\n/).flatMap((line) => {
    if (!line) return [' ']
    return pdf.splitTextToSize(line, width) as string[]
  })

  const drawPageHeader = (continuation: boolean) => {
    pageNumber += 1
    pdf.setFillColor(247, 248, 246)
    pdf.rect(0, 0, pageWidth, 27, 'F')
    pdf.setDrawColor(185, 190, 186)
    pdf.line(0, 27, pageWidth, 27)
    pdf.setTextColor(22, 27, 23)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(13)
    pdf.text(continuation ? 'WORK ORDER TRAVELER — CONTINUED' : 'WORK ORDER TRAVELER', margin, 9)
    pdf.setFontSize(10)
    pdf.text(`WO ${workOrder.workOrderNumber}`, margin, 17)
    pdf.text(`PART ${workOrder.partNumber}`, pageWidth / 2, 17)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(88, 94, 89)
    pdf.text(`Generated ${generatedAt}`, margin, 23)
    pdf.text(`Page ${pageNumber}`, pageWidth - margin, 23, { align: 'right' })
    y = 34
  }

  const addContinuationPage = () => {
    pdf.addPage()
    drawPageHeader(true)
  }

  const ensureSpace = (height: number) => {
    if (y + height > bottom) addContinuationPage()
  }

  const drawLabel = (label: string, x: number, top: number) => {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.setTextColor(92, 99, 93)
    pdf.text(label, x, top)
  }

  const drawMetaRow = (leftField: [string, string], rightField: [string, string]) => {
    const gap = 8
    const width = (contentWidth - gap) / 2
    const leftLines = wrap(leftField[1] || '—', width)
    const rightLines = wrap(rightField[1] || '—', width)
    const height = 8 + Math.max(leftLines.length, rightLines.length) * lineHeight
    ensureSpace(height)
    drawLabel(leftField[0], margin, y)
    drawLabel(rightField[0], margin + width + gap, y)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.setTextColor(22, 27, 23)
    pdf.text(leftLines, margin, y + 5)
    pdf.text(rightLines, margin + width + gap, y + 5)
    y += height
  }

  const drawFullTextSection = (label: string, value: string) => {
    const lines = wrap(value || '—', contentWidth)
    ensureSpace(13)
    drawLabel(label, margin, y)
    y += 5
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(22, 27, 23)
    for (const line of lines) {
      if (y + lineHeight > bottom) addContinuationPage()
      pdf.text(line, margin, y)
      y += lineHeight
    }
    y += 4
  }

  const drawToolingSection = (operationId: string, sequenceNumber: number) => {
    const assignments = toolingForOperation(operationId, workOrder.operationTooling)
    if (assignments.length === 0) return false

    y += 2

    const inset = 5
    const innerWidth = contentWidth - inset * 2
    const descriptionWidth = innerWidth - toolNumberWidth - toolAssemblyWidth
    const rows = assignments.map((assignment) => ({
      assignment,
      descriptionLines: wrap([assignment.toolAssemblyName || '—', assignment.toolAssemblyDescription ? `Description: ${assignment.toolAssemblyDescription}` : ''].filter(Boolean).join('\n'), descriptionWidth),
    }))
    let rowIndex = 0
    let continued = false

    while (rowIndex < rows.length) {
      const headerHeight = 12
      const minimumRowHeight = Math.max(toolingLineHeight, rows[rowIndex].descriptionLines.length * toolingLineHeight) + 2.5
      ensureSpace(headerHeight + minimumRowHeight + 3)

      const chunkStart = rowIndex
      let chunkHeight = headerHeight
      while (rowIndex < rows.length) {
        const rowHeight = Math.max(toolingLineHeight, rows[rowIndex].descriptionLines.length * toolingLineHeight) + 2.5
        if (rowIndex > chunkStart && y + chunkHeight + rowHeight + 3 > bottom) break
        chunkHeight += rowHeight
        rowIndex += 1
      }
      const blockHeight = chunkHeight + 3

      pdf.setFillColor(249, 250, 248)
      pdf.setDrawColor(196, 201, 197)
      pdf.roundedRect(margin, y, contentWidth, blockHeight, 1.5, 1.5, 'FD')
      pdf.setTextColor(31, 80, 48)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7)
      pdf.text(continued ? `TOOLING — STEP ${sequenceNumber} CONTINUED` : 'TOOLING', margin + inset, y + 5)
      pdf.setTextColor(92, 99, 93)
      pdf.setFontSize(5.8)
      pdf.text('TOOL NUMBER / POSITION', margin + inset, y + 9)
      pdf.text('TOOL ASSEMBLY', margin + inset + toolNumberWidth, y + 9)
      pdf.text('NAME / DESCRIPTION', margin + inset + toolNumberWidth + toolAssemblyWidth, y + 9)

      let rowY = y + headerHeight
      for (const row of rows.slice(chunkStart, rowIndex)) {
        const rowHeight = Math.max(toolingLineHeight, row.descriptionLines.length * toolingLineHeight) + 2.5
        pdf.setDrawColor(222, 225, 222)
        pdf.line(margin + inset, rowY - 1.5, pageWidth - margin - inset, rowY - 1.5)
        pdf.setTextColor(22, 27, 23)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(7.5)
        pdf.text(row.assignment.toolNumber, margin + inset, rowY + 1.5)
        pdf.text(row.assignment.toolAssemblyNumber, margin + inset + toolNumberWidth, rowY + 1.5)
        pdf.setFont('helvetica', 'normal')
        pdf.text(row.descriptionLines, margin + inset + toolNumberWidth + toolAssemblyWidth, rowY + 1.5)
        rowY += rowHeight
      }

      y += blockHeight
      continued = true
      if (rowIndex < rows.length) addContinuationPage()
    }
    return true
  }

  drawPageHeader(false)
  drawMetaRow(['SALES ORDER', salesOrder.salesOrderNumber], ['CUSTOMER PO', salesOrder.customerPoNumber])
  drawMetaRow(['CUSTOMER', salesOrder.customerName], ['QUANTITY', String(workOrder.quantityOrdered)])
  drawMetaRow(['DUE DATE', formatDate(workOrder.dueDate)], ['PART NUMBER', workOrder.partNumber])
  drawFullTextSection('TRAVELER NOTES', workOrder.notes)
  ensureSpace(8)
  pdf.setDrawColor(190, 195, 191)
  pdf.line(margin, y, pageWidth - margin, y)
  y += 8

  for (const step of [...workOrder.routing].sort((a, b) => a.sequenceNumber - b.sequenceNumber)) {
    const qrUrl = `${window.location.origin}/produce/${workOrder.id}/${step.id}`
    const qr = await QRCode.toDataURL(qrUrl, { margin: 0, width: 240, errorCorrectionLevel: 'M' })
    const pending = wrap(step.workInstructions || 'No instructions entered.', contentWidth - 47)
    let firstBlock = true

    while (firstBlock || pending.length > 0) {
      ensureSpace(firstBlock ? 45 : 25)
      const availableHeight = bottom - y
      const textWidth = firstBlock ? contentWidth - 47 : contentWidth - 10
      const headingHeight = firstBlock ? 19 : 16
      const maxLines = Math.max(1, Math.floor((availableHeight - headingHeight - 7) / lineHeight))
      const chunk = pending.splice(0, maxLines)
      const blockHeight = Math.max(firstBlock ? 43 : 24, headingHeight + chunk.length * lineHeight + 7)

      pdf.setFillColor(249, 250, 248)
      pdf.setDrawColor(196, 201, 197)
      pdf.roundedRect(margin, y, contentWidth, blockHeight, 1.5, 1.5, 'FD')
      pdf.setTextColor(31, 80, 48)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8)
      pdf.text(firstBlock ? `STEP ${step.sequenceNumber}` : `STEP ${step.sequenceNumber} — CONTINUED`, margin + 5, y + 7)
      pdf.setTextColor(22, 27, 23)
      pdf.setFontSize(firstBlock ? 12 : 9)
      pdf.text(step.routingStepName, margin + 5, y + (firstBlock ? 14 : 13))
      if (firstBlock) {
        pdf.addImage(qr, 'PNG', pageWidth - margin - 37, y + 5, 32, 32)
      }
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8.5)
      pdf.setTextColor(22, 27, 23)
      pdf.text(chunk, margin + 5, y + headingHeight, { maxWidth: textWidth })
      y += blockHeight
      firstBlock = false
    }
    drawToolingSection(step.id, step.sequenceNumber)
    y += 6
  }

  ensureSpace(34)
  drawLabel('HANDWRITTEN NOTES / QTY / SCRAP / INITIALS', margin, y)
  y += 4
  pdf.setDrawColor(150, 156, 151)
  for (let index = 0; index < 4; index += 1) {
    y += 6
    pdf.line(margin, y, pageWidth - margin, y)
  }

  pdf.save(`${workOrder.workOrderNumber}-traveler.pdf`)
}
