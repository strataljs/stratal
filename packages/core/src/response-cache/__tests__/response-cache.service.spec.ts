import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CachePurgeError } from '../errors'
import { ResponseCacheService } from '../services/response-cache.service'

const logger = { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() }
const scopes = { param: { slug: 'hello' }, query: {}, body: undefined, data: { post: { categoryId: 42 } } }

describe('ResponseCacheService', () => {
  let service: ResponseCacheService

  beforeEach(() => {
    vi.clearAllMocks()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow logger stub
    service = new ResponseCacheService(logger as any)
  })

  it('renders interpolated purge tags', () => {
    const spec = service.buildPurgeSpec(
      { tags: ['post:{param.slug}', 'cat:{data.post.categoryId}'] },
      scopes,
    )
    expect(spec).toEqual({ tags: ['post:hello', 'cat:42'] })
  })

  it('passes path prefixes through', () => {
    expect(service.buildPurgeSpec({ pathPrefixes: ['/blog'] }, scopes)).toEqual({
      pathPrefixes: ['/blog'],
    })
  })

  it('builds a purgeEverything spec', () => {
    expect(service.buildPurgeSpec({ purgeEverything: true }, scopes)).toEqual({
      purgeEverything: true,
    })
  })

  it('calls the cache purge API with the spec', async () => {
    const cache = { purge: vi.fn().mockResolvedValue({ success: true }) }
    await service.purge({ tags: ['a'] }, cache)
    expect(cache.purge).toHaveBeenCalledWith({ tags: ['a'] })
  })

  it('throws CachePurgeError when the purge rejects', async () => {
    const cache = { purge: vi.fn().mockRejectedValue(new Error('boom')) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow cache stub
    await expect(service.purge({ tags: ['a'] }, cache as any)).rejects.toThrow(CachePurgeError)
    expect(logger.error).toHaveBeenCalled()
  })

  it('throws CachePurgeError when the purge reports failure', async () => {
    const cache = { purge: vi.fn().mockResolvedValue({ success: false }) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow cache stub
    await expect(service.purge({ tags: ['a'] }, cache as any)).rejects.toThrow(CachePurgeError)
    // The reported-failure branch must log before throwing, same as the
    // rejected-promise branch — a purge that silently fails leaves the cache
    // inconsistent with the database, which is the whole reason this throws.
    expect(logger.error).toHaveBeenCalled()
  })
})
