import { describe, expect, it } from 'vitest'
import { inspectPdfBytes } from './documentSecurity'

const bytes = (value: string) => new TextEncoder().encode(value)

describe('inspectPdfBytes', () => {
  it('accepts a passive PDF structure', () => {
    expect(inspectPdfBytes(bytes('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj'))).toBeNull()
  })

  it('rejects files without a PDF signature', () => {
    expect(inspectPdfBytes(bytes('MZ executable'))).toMatch(/valid PDF header/)
  })

  it('rejects PDF active content and embedded files', () => {
    expect(inspectPdfBytes(bytes('%PDF-1.7\n<< /OpenAction 1 0 R /JavaScript 2 0 R >>'))).toMatch(/scripts/)
    expect(inspectPdfBytes(bytes('%PDF-1.7\n<< /Type /EmbeddedFile >>'))).toMatch(/embedded files/)
  })
})
