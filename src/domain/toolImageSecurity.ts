export type ToolImageType = { contentType: 'image/jpeg' | 'image/png' | 'image/webp'; extension: 'jpg' | 'png' | 'webp' }

export function inspectToolImageBytes(bytes: Uint8Array): ToolImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { contentType: 'image/jpeg', extension: 'jpg' }
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) return { contentType: 'image/png', extension: 'png' }
  if (bytes.length >= 12
    && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF'
    && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return { contentType: 'image/webp', extension: 'webp' }
  return null
}

export async function validateToolAssemblyImage(file: File): Promise<ToolImageType> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.')
  if (file.size > 5 * 1024 * 1024) throw new Error('Tool assembly images must be 5 MB or smaller.')
  const detected = inspectToolImageBytes(new Uint8Array(await file.arrayBuffer()))
  if (!detected || detected.contentType !== file.type) throw new Error('The selected file does not contain a valid JPG, PNG, or WebP image.')
  return detected
}
