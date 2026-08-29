import { describe, expect, it } from 'vitest'
import { inspectToolImageBytes } from './toolImageSecurity'

describe('tool assembly image validation', () => {
  it('recognizes supported image signatures', () => {
    expect(inspectToolImageBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.contentType).toBe('image/jpeg')
    expect(inspectToolImageBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.contentType).toBe('image/png')
    expect(inspectToolImageBytes(new TextEncoder().encode('RIFF0000WEBP'))?.contentType).toBe('image/webp')
  })

  it('rejects unsupported or disguised file content', () => {
    expect(inspectToolImageBytes(new TextEncoder().encode('<svg><script /></svg>'))).toBeNull()
    expect(inspectToolImageBytes(new TextEncoder().encode('GIF89a'))).toBeNull()
  })
})
