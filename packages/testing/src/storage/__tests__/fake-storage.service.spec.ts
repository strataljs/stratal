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
  // `hasDisk` is given real behaviour rather than the mock's default: it returns a truthy mock
  // for every name otherwise, which would make any "unknown disk is rejected" assertion pass
  // against the mock rather than against the code.
  const manager = createMock<StorageManagerService>()
  manager.hasDisk.mockImplementation((name: string) => name === 'local')

  return new FakeStorageService(manager, config)
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

describe('FakeStorageService.list', () => {
  async function seed(storage: FakeStorageService, paths: string[]): Promise<void> {
    for (const path of paths) {
      await storage.upload('x', path, { mimeType: 'text/plain', size: 1 })
    }
  }

  it('truncates without being asked, so a missing cursor loop fails here', async () => {
    // The whole reason the fake exists in this shape. Returning everything by default would let
    // a caller who never follows `cursor` pass, then undercount against R2's real page ceiling.
    const storage = createStorage()
    await seed(storage, ['docs/a.txt', 'docs/b.txt', 'docs/c.txt'])

    const page = await storage.list({ prefix: 'docs/' })

    expect(page.objects).toHaveLength(1)
    expect(page.truncated).toBe(true)
    expect(page.cursor).toBeDefined()
  })

  it('yields every object across pages when the caller follows the cursor', async () => {
    const storage = createStorage()
    await seed(storage, ['docs/a.txt', 'docs/b.txt', 'docs/c.txt'])

    const seen: string[] = []
    let cursor: string | undefined
    do {
      const page = await storage.list({ prefix: 'docs/', cursor })
      seen.push(...page.objects.map((object) => object.path))
      cursor = page.cursor
    } while (cursor)

    expect(seen).toEqual(['docs/a.txt', 'docs/b.txt', 'docs/c.txt'])
  })

  it('honours an explicit limit and stops truncating on the final page', async () => {
    const storage = createStorage()
    await seed(storage, ['docs/a.txt', 'docs/b.txt'])

    const page = await storage.list({ prefix: 'docs/', limit: 10 })

    expect(page.objects).toHaveLength(2)
    expect(page.truncated).toBe(false)
    expect(page.cursor).toBeUndefined()
  })

  it('withholds contentType and metadata unless the listing asks for them', async () => {
    // Mirrors R2, which omits both unless `include` names them. A fake that always returned them
    // would let a test read `contentType` off a listing and find it undefined in production.
    const storage = createStorage()
    await storage.upload('x', 'docs/a.txt', { mimeType: 'text/plain', size: 1 })

    const withoutMetadata = await storage.list({ prefix: 'docs/', limit: 10 })
    expect(withoutMetadata.objects[0]?.contentType).toBeUndefined()

    const withMetadata = await storage.list({ prefix: 'docs/', limit: 10, includeMetadata: true })
    expect(withMetadata.objects[0]?.contentType).toBe('text/plain')
  })

  it('accepts the disk argument the real service takes', async () => {
    // Narrowing an override is legal TypeScript, so a fake that dropped `disk` still compiled —
    // and only failed at the call site of a test that passed one. These calls are the assertion:
    // they do not compile if the signatures drift apart again.
    const storage = createStorage()
    await storage.upload('x', 'docs/a.txt', { mimeType: 'text/plain', size: 1 }, 'local')

    await expect(storage.head('docs/a.txt', 'local')).resolves.not.toBeNull()
    await expect(storage.list({ prefix: 'docs/', limit: 10 }, 'local')).resolves.toMatchObject({
      truncated: false,
    })
    await expect(storage.deleteMany(['docs/a.txt'], 'local')).resolves.toBeUndefined()
    await expect(storage.head('docs/a.txt', 'local')).resolves.toBeNull()
  })

  it('refuses a disk that is not configured, as the real service does', async () => {
    const storage = createStorage()

    // Rejected, not thrown synchronously: the real service's methods are `async`, so a caller
    // chaining `.catch()` without awaiting still gets its handler. A fake that threw before the
    // promise existed would skip that handler and diverge on exactly the path it exists to model.
    await expect(storage.head('docs/a.txt', 'nope')).rejects.toThrow()
    await expect(storage.list({}, 'nope')).rejects.toThrow()
    await expect(storage.deleteMany(['docs/a.txt'], 'nope')).rejects.toThrow()
  })

  it('excludes objects outside the prefix', async () => {
    const storage = createStorage()
    await seed(storage, ['docs/a.txt', 'other/b.txt'])

    const page = await storage.list({ prefix: 'docs/', limit: 10 })

    expect(page.objects.map((object) => object.path)).toEqual(['docs/a.txt'])
  })
})
