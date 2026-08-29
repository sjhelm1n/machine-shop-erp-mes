import jsPDF from 'jspdf'
import QRCode from 'qrcode'
import type { ToolAssembly } from '../domain/types'

export async function generateToolAssemblyLabel(tool: ToolAssembly): Promise<void> {
  const pdf = new jsPDF({ unit: 'mm', format: [89, 36], orientation: 'landscape' })
  const url = `${window.location.origin}/app/tools/${tool.id}?action=checkout`
  const qr = await QRCode.toDataURL(url, { margin: 0, width: 240, errorCorrectionLevel: 'M' })
  pdf.setDrawColor(45, 55, 47)
  pdf.roundedRect(1.5, 1.5, 86, 33, 1.5, 1.5)
  pdf.addImage(qr, 'PNG', 58, 4, 28, 28)
  pdf.setTextColor(22, 27, 23)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.text(tool.assemblyNumber, 5, 9)
  pdf.setFontSize(10)
  const name = pdf.splitTextToSize(tool.name, 49) as string[]
  pdf.text(name.slice(0, 2), 5, 14)
  const nameLines = Math.min(name.length, 2)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  const description = pdf.splitTextToSize(tool.description || 'No description', 49) as string[]
  pdf.text(description.slice(0, nameLines === 2 ? 2 : 3), 5, nameLines === 2 ? 23 : 20)
  pdf.setFontSize(6)
  pdf.setTextColor(88, 94, 89)
  pdf.text('Scan to check in or out', 5, 33)
  pdf.save(`${tool.assemblyNumber}-label.pdf`)
}
