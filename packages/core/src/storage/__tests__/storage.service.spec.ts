import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { beforeEach, describe, expect, it } from 'vitest'

import type { HeadResult, ListResult } from '../contracts'
import type { IStorageProvider } from '../providers/storage-provider.interface'
import type { StorageManagerService } from '../services/storage-manager.service'
import { StorageService } from '../services/storage.service'
import type { StorageConfig, StorageEntry } from '../types'

const ROOT = 'tenant-a/uploads'

const DISK: StorageEntry = { disk: 'main', binding: 'BUCKET', root: ROOT }

const CONFIG: StorageConfig = {
  storage: [DISK],
  defaultStorageDisk: 'main',
  presignedUrl: { defaultExpiry: 3600, maxExpiry: 604800 },
}

/**
 * `head` and `list` are the only read paths that hand a PATH back to the caller, so they are the
 * only ones that can leak the disk root. Everything here is about that round trip: what comes out
 * must be what `download`/`delete` accept going in.
 */
describe('StorageService head/list path handling', () => {
  let provider: DeepMocked<IStorageProvider>
  let manager: DeepMocked<StorageManagerService>
  let storage: StorageService

  beforeEach(() => {
    provider = createMock<IStorageProvider>()
    manager = createMock<StorageManagerService>()
    manager.getProvider.mockResolvedValue(provider)
    manager.getDiskConfig.mockReturnValue(DISK)
    manager.hasDisk.mockReturnValue(true)
    storage = new StorageService(manager, CONFIG)
  })

  it('asks the provider for the rooted path and returns a disk-relative one', async () => {
    provider.head.mockResolvedValue({
      path: `${ROOT}/documents/report.pdf`,
      size: 42,
    } satisfies HeadResult)

    const result = await storage.head('documents/report.pdf')

    expect(provider.head).toHaveBeenCalledWith(`${ROOT}/documents/report.pdf`)
    // Relative on the way out: a caller must be able to pass this straight to `download`.
    expect(result?.path).toBe('documents/report.pdf')
    expect(result?.size).toBe(42)
  })

  it('returns null for a missing object rather than inventing a zero-size result', async () => {
    provider.head.mockResolvedValue(null)

    await expect(storage.head('nope.pdf')).resolves.toBeNull()
  })

  it('roots an empty prefix at the disk, so a listing cannot escape into another disk', async () => {
    provider.list.mockResolvedValue({ objects: [], truncated: false } satisfies ListResult)

    await storage.list()

    // The bucket is shared between disks. An empty prefix passed through verbatim would list
    // every other disk's objects too. The trailing slash matters as well: a bare `tenant-a/uploads`
    // would also match a sibling disk rooted at `tenant-a/uploads-archive`.
    expect(provider.list).toHaveBeenCalledWith(expect.objectContaining({ prefix: `${ROOT}/` }))
  })

  it('strips the root from every listed object and preserves truncation', async () => {
    provider.list.mockResolvedValue({
      objects: [
        { path: `${ROOT}/units/one.json`, size: 10 },
        { path: `${ROOT}/units/two.json`, size: 20 },
      ],
      truncated: true,
      cursor: 'next',
    } satisfies ListResult)

    const page = await storage.list({ prefix: 'units/' })

    expect(page.objects.map((object) => object.path)).toEqual([
      'units/one.json',
      'units/two.json',
    ])
    // Truncation must survive the mapping — dropping it is how a caller ends up summing one page
    // and believing it has the whole prefix.
    expect(page.truncated).toBe(true)
    expect(page.cursor).toBe('next')
  })

  it('leaves a path that does not sit under the root untouched', async () => {
    // Can only happen if a provider returned something outside the disk. Trimming a prefix off it
    // anyway would disguise that fault as an ordinary relative path.
    provider.head.mockResolvedValue({ path: 'elsewhere/odd.pdf', size: 1 } satisfies HeadResult)

    const result = await storage.head('odd.pdf')

    expect(result?.path).toBe('elsewhere/odd.pdf')
  })
})
