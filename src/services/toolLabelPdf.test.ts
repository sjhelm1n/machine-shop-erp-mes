import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolAssembly } from '../domain/types'

const { pdf, qrToDataUrl } = vi.hoisted(() => ({
  pdf: {
    text: vi.fn(), splitTextToSize: vi.fn((value: string) => [value]), addImage: vi.fn(), save: vi.fn(),
    setDrawColor: vi.fn(), roundedRect: vi.fn(), setTextColor: vi.fn(), setFont: vi.fn(), setFontSize: vi.fn(),
  },
  qrToDataUrl: vi.fn(async () => 'data:image/png;base64,qr'),
}))

vi.mock('jspdf', () => ({ default: vi.fn(() => pdf) }))
vi.mock('qrcode', () => ({ default: { toDataURL: qrToDataUrl } }))

import { generateToolAssemblyLabel } from './toolLabelPdf'

const tool: ToolAssembly = {
  id: 'assembly-id', organizationId: 'org-id', assemblyNumber: 'TA-001', name: 'Long tool assembly name', description: 'Detailed setup description',
  quantityCheckedOut: 0, quantityInUse: 0, futureRequirements: 0, usageWarning: false,
  imagePath: null, imageUrl: null, archivedAt: null, createdAt: '', updatedAt: '',
}

describe('tool assembly label PDF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('window', { location: { origin: 'https://shopcore.example' } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('prints the assembly identity and a same-origin detail QR code', async () => {
    await generateToolAssemblyLabel(tool)

    expect(qrToDataUrl).toHaveBeenCalledWith('https://shopcore.example/app/tools/assembly-id?action=checkout', expect.objectContaining({ errorCorrectionLevel: 'M' }))
    expect(pdf.text).toHaveBeenCalledWith('TA-001', 5, 9)
    expect(pdf.splitTextToSize).toHaveBeenCalledWith('Long tool assembly name', 49)
    expect(pdf.splitTextToSize).toHaveBeenCalledWith('Detailed setup description', 49)
    expect(pdf.text).toHaveBeenCalledWith(['Detailed setup description'], 5, 20)
    expect(pdf.text).toHaveBeenCalledWith('Scan to check in or out', 5, 33)
    expect(pdf.addImage).toHaveBeenCalledWith('data:image/png;base64,qr', 'PNG', 58, 4, 28, 28)
    expect(pdf.save).toHaveBeenCalledWith('TA-001-label.pdf')
  })
})
