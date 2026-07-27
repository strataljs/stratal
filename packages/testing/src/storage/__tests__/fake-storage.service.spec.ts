import { createMock } from '@golevelup/ts-vitest'
import type { StorageConfig, StorageManagerService } from 'stratal/storage'
import { describe, expect, it } from 'vitest'
import { FakeStorageService } from '../fake-storage.service'

function createStorage(): FakeStorageService {
  const config: StorageConfig = {
    storage: [],
    defaultStorageDisk: 'local',
    presignedUrl: { defaultExpiry: 3600, maxExpiry: 86400 },
  }

  // chunkedUpload/upload never reach the storage manager (the fake keeps files
  // in memory), so a typed mock is a faithful stand-in for the constructor dep.
  return new FakeStorageService(createMock<StorageManagerService>(), config)
}

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk)
      }
      controller.close()
    },
  })
}

describe('FakeStorageService.chunkedUpload', () => {
  it('consumes a single-use ReadableStream body exactly once and stores its bytes', async () => {
    const storage = createStorage()
    const bytes = new TextEncoder().encode('chunked-upload-body')

    // A ReadableStream is single-use: reading it a second time throws
    // "ReadableStream is disturbed", so this only resolves when the body is
    // read once.
    const result = await storage.chunkedUpload(streamFromChunks([bytes]), 'uploads/report.txt', {
      mimeType: 'text/plain',
    })

    expect(result.path).toBe('uploads/report.txt')
    expect(result.size).toBe(bytes.length)

    const stored = storage.getFile('uploads/report.txt')
    expect(stored?.content).toEqual(bytes)
    expect(stored?.size).toBe(bytes.length)
    expect(stored?.mimeType).toBe('text/plain')
  })

  it('reassembles a multi-chunk stream body in order', async () => {
    const storage = createStorage()
    const first = new TextEncoder().encode('first-')
    const second = new TextEncoder().encode('second')

    await storage.chunkedUpload(streamFromChunks([first, second]), 'uploads/multi.bin', {})

    const stored = storage.getFile('uploads/multi.bin')
    expect(stored?.content).toEqual(new TextEncoder().encode('first-second'))
    expect(stored?.size).toBe(first.length + second.length)
  })
})
