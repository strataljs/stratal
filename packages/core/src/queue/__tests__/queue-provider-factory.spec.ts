import { beforeEach, describe, expect, it } from 'vitest';
import { Container } from '../../di/container';
import { type StratalEnv } from '../../env';
import { ConsumerRegistry } from '../consumer-registry';
import { CloudflareQueueProvider, SyncQueueProvider } from '../providers';
import { QueueError } from '../queue.error';
import type { QueueModuleOptions } from '../queue.module';
import { QueueProviderFactory } from '../services/queue-provider-factory';

describe('QueueProviderFactory', () => {
  let factory: QueueProviderFactory
  let mockEnv: StratalEnv
  let registry: ConsumerRegistry
  let container: Container

  beforeEach(() => {
    mockEnv = {
      NOTIFICATIONS_QUEUE: {},
    } as unknown as StratalEnv
    registry = new ConsumerRegistry()
    container = new Container()
  })

  describe('create', () => {
    it('should return CloudflareQueueProvider for cloudflare config', () => {
      const options: QueueModuleOptions = { provider: 'cloudflare', store: { binding: 'CACHE' } }
      factory = new QueueProviderFactory(mockEnv, registry, container, options)

      const provider = factory.create()

      expect(provider).toBeInstanceOf(CloudflareQueueProvider)
    })

    it('should return SyncQueueProvider for sync config', () => {
      const options: QueueModuleOptions = { provider: 'sync', store: { binding: 'CACHE' } }
      factory = new QueueProviderFactory(mockEnv, registry, container, options)

      const provider = factory.create()

      expect(provider).toBeInstanceOf(SyncQueueProvider)
    })

    it('should throw QueueError for unknown provider', () => {
      const options = { provider: 'unknown' } as unknown as QueueModuleOptions
      factory = new QueueProviderFactory(mockEnv, registry, container, options)

      expect(() => factory.create()).toThrow(QueueError)
    })

    it('should create new provider instance each time', () => {
      const options: QueueModuleOptions = { provider: 'sync', store: { binding: 'CACHE' } }
      factory = new QueueProviderFactory(mockEnv, registry, container, options)

      const provider1 = factory.create()
      const provider2 = factory.create()

      // Each call creates a new instance
      expect(provider1).not.toBe(provider2)
      expect(provider1).toBeInstanceOf(SyncQueueProvider)
      expect(provider2).toBeInstanceOf(SyncQueueProvider)
    })

    it('should pass correct dependencies to CloudflareQueueProvider', () => {
      const options: QueueModuleOptions = { provider: 'cloudflare', store: { binding: 'CACHE' } }
      factory = new QueueProviderFactory(mockEnv, registry, container, options)

      const provider = factory.create()

      expect(provider).toBeInstanceOf(CloudflareQueueProvider)
      // Provider has access to env for queue binding resolution
    })

    it('should pass correct dependencies to SyncQueueProvider', () => {
      const options: QueueModuleOptions = { provider: 'sync', store: { binding: 'CACHE' } }
      factory = new QueueProviderFactory(mockEnv, registry, container, options)

      const provider = factory.create()

      expect(provider).toBeInstanceOf(SyncQueueProvider)
      // Provider has access to registry for consumer lookup
    })

    it('should default to cloudflare provider when no options provided', () => {
      factory = new QueueProviderFactory(mockEnv, registry, container)

      const provider = factory.create()

      expect(provider).toBeInstanceOf(CloudflareQueueProvider)
    })
  })
})
