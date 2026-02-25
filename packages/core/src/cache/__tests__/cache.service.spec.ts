import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import type { LoggerService } from '../../logger/services/logger.service'
import type { StratalEnv } from '../../env'
import { CacheService } from '../services/cache.service'
import { CacheGetError } from '../errors/cache-get.error'
import { CachePutError } from '../errors/cache-put.error'
import { CacheDeleteError } from '../errors/cache-delete.error'
import { CacheListError } from '../errors/cache-list.error'

describe('CacheService', () => {
  let service: CacheService
  let mockKv: DeepMocked<KVNamespace>
  let mockLogger: DeepMocked<LoggerService>
  let mockEnv: DeepMocked<StratalEnv>

  beforeEach(() => {
    vi.clearAllMocks()

    mockKv = createMock<KVNamespace>()
    mockLogger = createMock<LoggerService>()
    mockEnv = { CACHE: mockKv } as unknown as DeepMocked<StratalEnv>

    service = new CacheService(mockEnv as unknown as StratalEnv, mockLogger as unknown as LoggerService)
  })

  // Narrowed mock references for overloaded KVNamespace methods.
  // DeepMocked resolves to the last (batch) overload, so we cast to the single-key signatures.
  const mockGet = () => mockKv.get as unknown as {
    mockResolvedValue(v: string | null): void
    mockRejectedValue(v: unknown): void
  }
  const mockGetWithMetadata = () => mockKv.getWithMetadata as unknown as {
    mockResolvedValue(v: KVNamespaceGetWithMetadataResult<string, unknown>): void
    mockRejectedValue(v: unknown): void
  }

  describe('get()', () => {
    it('should delegate to kv.get(key) and return result', async () => {
      mockGet().mockResolvedValue('cached-value')

      const result = await service.get('test-key')

      expect(result).toBe('cached-value')
      expect(mockKv.get).toHaveBeenCalledWith('test-key')
    })

    it('should delegate with type parameter', async () => {
      const jsonData = { name: 'test' }
      mockGet().mockResolvedValue(jsonData as unknown as string)

      const result = await service.get('json-key', 'json')

      expect(result).toEqual({ name: 'test' })
      expect(mockKv.get).toHaveBeenCalledWith('json-key', 'json')
    })

    it('should return null when key not found', async () => {
      mockGet().mockResolvedValue(null)

      const result = await service.get('missing-key')

      expect(result).toBeNull()
    })

    it('should throw CacheGetError on KV failure and log error', async () => {
      mockGet().mockRejectedValue(new Error('KV error'))

      await expect(service.get('fail-key')).rejects.toThrow(CacheGetError)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cache get operation failed',
        expect.objectContaining({ key: 'fail-key' })
      )
    })
  })

  describe('put()', () => {
    it('should delegate to kv.put(key, value, undefined)', async () => {
      mockKv.put.mockResolvedValue(undefined)

      await service.put('key', 'value')

      expect(mockKv.put).toHaveBeenCalledWith('key', 'value', undefined)
    })

    it('should pass options when provided', async () => {
      mockKv.put.mockResolvedValue(undefined)

      await service.put('key', 'value', { expirationTtl: 3600 })

      expect(mockKv.put).toHaveBeenCalledWith('key', 'value', { expirationTtl: 3600 })
    })

    it('should throw CachePutError on failure', async () => {
      mockKv.put.mockRejectedValue(new Error('KV put error'))

      await expect(service.put('key', 'value')).rejects.toThrow(CachePutError)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cache put operation failed',
        expect.objectContaining({ key: 'key' })
      )
    })
  })

  describe('delete()', () => {
    it('should delegate to kv.delete(key)', async () => {
      mockKv.delete.mockResolvedValue(undefined)

      await service.delete('key')

      expect(mockKv.delete).toHaveBeenCalledWith('key')
    })

    it('should throw CacheDeleteError on failure', async () => {
      mockKv.delete.mockRejectedValue(new Error('KV delete error'))

      await expect(service.delete('key')).rejects.toThrow(CacheDeleteError)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cache delete operation failed',
        expect.objectContaining({ key: 'key' })
      )
    })
  })

  describe('list()', () => {
    it('should delegate to kv.list() and return result', async () => {
      const listResult = { keys: [{ name: 'key1' }], list_complete: true, cacheStatus: null }
      mockKv.list.mockResolvedValue(listResult as unknown as KVNamespaceListResult<unknown>)

      const result = await service.list()

      expect(result).toBe(listResult)
      expect(mockKv.list).toHaveBeenCalledWith(undefined)
    })

    it('should pass options when provided', async () => {
      const listResult = { keys: [], list_complete: true, cacheStatus: null }
      mockKv.list.mockResolvedValue(listResult as unknown as KVNamespaceListResult<unknown>)

      await service.list({ prefix: 'user:' })

      expect(mockKv.list).toHaveBeenCalledWith({ prefix: 'user:' })
    })

    it('should throw CacheListError on failure', async () => {
      mockKv.list.mockRejectedValue(new Error('KV list error'))

      await expect(service.list()).rejects.toThrow(CacheListError)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cache list operation failed',
        expect.objectContaining({ options: undefined })
      )
    })
  })

  describe('getWithMetadata()', () => {
    it('should return value and metadata result', async () => {
      const result = { value: 'data', metadata: { created: 123 }, cacheStatus: null }
      mockGetWithMetadata().mockResolvedValue(result as unknown as KVNamespaceGetWithMetadataResult<string, unknown>)

      const actual = await service.getWithMetadata('key')

      expect(actual).toBe(result)
      expect(mockKv.getWithMetadata).toHaveBeenCalledWith('key')
    })

    it('should throw CacheGetError on failure', async () => {
      mockGetWithMetadata().mockRejectedValue(new Error('KV error'))

      await expect(service.getWithMetadata('key')).rejects.toThrow(CacheGetError)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cache getWithMetadata operation failed',
        expect.objectContaining({ key: 'key' })
      )
    })
  })

  describe('withBinding()', () => {
    it('should return new instance using different KV namespace', () => {
      const newKv = createMock<KVNamespace>()
      const newService = service.withBinding(newKv)

      expect(newService).toBeInstanceOf(CacheService)
      expect(newService).not.toBe(service)
    })

    it('should use the new KV binding for operations', async () => {
      const newKv = createMock<KVNamespace>()
      const newKvGet = newKv.get as unknown as { mockResolvedValue(v: string | null): void }
      newKvGet.mockResolvedValue('from-new-kv')

      const newService = service.withBinding(newKv)
      const result = await newService.get('key')

      expect(result).toBe('from-new-kv')
      expect(newKv.get).toHaveBeenCalledWith('key')
      expect(mockKv.get).not.toHaveBeenCalled()
    })
  })
})
