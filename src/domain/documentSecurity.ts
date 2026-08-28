const blockedPdfMarkers = [
  '/JavaScript',
  '/JS',
  '/Launch',
  '/EmbeddedFile',
  '/Filespec',
  '/OpenAction',
  '/AdditionalActions',
]

export function inspectPdfBytes(bytes: Uint8Array): string | null {
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') return 'The selected file does not have a valid PDF header.'

  const content = new TextDecoder().decode(bytes)
  const marker = blockedPdfMarkers.find((candidate) => content.includes(candidate))
  return marker ? 'PDFs containing scripts, launch actions, or embedded files cannot be uploaded.' : null
}

export async function validateDocumentPdf(file: File): Promise<void> {
  if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Only PDF files can be uploaded.')
  if (file.size > 10 * 1024 * 1024) throw new Error('PDF files must be 10 MB or smaller.')
  const issue = inspectPdfBytes(new Uint8Array(await file.arrayBuffer()))
  if (issue) throw new Error(issue)
}
