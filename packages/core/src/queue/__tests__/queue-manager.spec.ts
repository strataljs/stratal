import { createMock, type DeepMocked } from '@stratal/testing/mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoggerService } from '../../logger';
import { ConsumerRegistry } from '../consumer-registry';
import type { IQueueConsumer, QueueMessage } from '../queue-consumer';
import { QueueManager } from '../queue-manager';
import type { QueueStore } from '../queue-store';
import type { QueueModuleOptions } from '../queue.module';

describe('QueueManager', () => {
  let queueManager: QueueManager
  let consumerRegistry: ConsumerRegistry
  let mockLogger: DeepMocked<LoggerService>
  let mockStore: DeepMocked<QueueStore>
  const mockOptions: QueueModuleOptions = {
    provider: 'cloudflare',
    store: { binding: 'CACHE' },
    maxRetries: 3,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    consumerRegistry = new ConsumerRegistry()
    mockLogger = createMock<LoggerService>()
    mockStore = createMock<QueueStore>()
    mockStore.isProcessed.mockResolvedValue(false)
    mockStore.markProcessed.mockResolvedValue(undefined)
    mockStore.storeFailedJob.mockResolvedValue(undefined)
    mockStore.removeFailedJob.mockResolvedValue(undefined)
    queueManager = new QueueManager(
      consumerRegistry,
      mockLogger as unknown as LoggerService,
      mockStore as unknown as QueueStore,
      mockOptions,
    )
  })

  const createMockBatch = (messages: QueueMessage[], attempts = 1): DeepMocked<MessageBatch> => {
    const mockMessages = messages.map((body) => {
      const msg = createMock<Message>()
      ;(msg as unknown as { body: QueueMessage }).body = body
      ;(msg as unknown as { attempts: number }).attempts = attempts
      return msg
    })

    const batch = createMock<MessageBatch>()
    ;(batch as unknown as { messages: DeepMocked<Message>[] }).messages = mockMessages
    ;(batch as unknown as { queue: string }).queue = 'test-queue'
    return batch
  }

  const createConsumer = (messageTypes: string[]): DeepMocked<IQueueConsumer> => {
    const consumer = createMock<IQueueConsumer>({
      messageTypes,
    })
    consumer.handle.mockResolvedValue(undefined)
    return consumer
  }

  describe('processBatch', () => {
    it('should route messages to consumers by type', async () => {
      const consumer = createConsumer(['email.send'])
      consumerRegistry.register(consumer)

      const batch = createMockBatch([
        { id: '1', type: 'email.send', payload: { to: 'test@example.com' } },
      ])

      await queueManager.processBatch('notifications-queue', batch)

      expect(consumer.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          type: 'email.send',
          payload: { to: 'test@example.com' },
        })
      )
    })

    it('should call ack() on successful processing', async () => {
      const consumer = createConsumer(['email.send'])
      consumerRegistry.register(consumer)

      const batch = createMockBatch([
        { id: '1', type: 'email.send', payload: {} },
      ])

      await queueManager.processBatch('notifications-queue', batch)

      expect(batch.messages[0].ack).toHaveBeenCalled()
    })

    it('should call retry() and onError() on consumer failure when retries remain', async () => {
      const error = new Error('Processing failed')
      const consumer = createConsumer(['email.send'])
      consumer.handle.mockRejectedValue(error)
      consumer.onError!.mockResolvedValue(undefined)
      consumerRegistry.register(consumer)

      const batch = createMockBatch([
        { id: '1', type: 'email.send', payload: {} },
      ])

      await queueManager.processBatch('notifications-queue', batch)

      expect(consumer.onError).toHaveBeenCalledWith(error, expect.objectContaining({ id: '1' }))
      expect(batch.messages[0].retry).toHaveBeenCalled()
      expect(batch.messages[0].ack).not.toHaveBeenCalled()
      expect(mockStore.storeFailedJob).not.toHaveBeenCalled()
    })

    it('should store failed job and ack when retries exhausted', async () => {
      const error = new Error('Processing failed')
      const consumer = createConsumer(['email.send'])
      consumer.handle.mockRejectedValue(error)
      consumer.onError!.mockResolvedValue(undefined)
      consumerRegistry.register(consumer)

      const batch = createMockBatch([
        { id: '1', type: 'email.send', payload: {} },
      ], 3)

      await queueManager.processBatch('notifications-queue', batch)

      expect(mockStore.storeFailedJob).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          queue: 'notifications-queue',
          error: expect.objectContaining({ message: 'Processing failed' }),
        }),
      )
      expect(batch.messages[0].ack).toHaveBeenCalled()
      expect(batch.messages[0].retry).not.toHaveBeenCalled()
    })

    it('should handle multiple consumers for same message type', async () => {
      const consumer1 = createConsumer(['user.created'])
      const consumer2 = createConsumer(['user.created'])

      consumerRegistry.register(consumer1)
      consumerRegistry.register(consumer2)

      const batch = createMockBatch([
        { id: '1', type: 'user.created', payload: { userId: 'u1' } },
      ])

      await queueManager.processBatch('events-queue', batch)

      expect(consumer1.handle).toHaveBeenCalled()
      expect(consumer2.handle).toHaveBeenCalled()
    })

    it('should process all messages in batch', async () => {
      const consumer = createConsumer(['email.send'])
      consumerRegistry.register(consumer)

      const batch = createMockBatch([
        { id: '1', type: 'email.send', payload: { to: 'a@example.com' } },
        { id: '2', type: 'email.send', payload: { to: 'b@example.com' } },
        { id: '3', type: 'email.send', payload: { to: 'c@example.com' } },
      ])

      await queueManager.processBatch('notifications-queue', batch)

      expect(consumer.handle).toHaveBeenCalledTimes(3)
      expect(batch.messages[0].ack).toHaveBeenCalled()
      expect(batch.messages[1].ack).toHaveBeenCalled()
      expect(batch.messages[2].ack).toHaveBeenCalled()
    })

    it('should ack messages with no matching consumers', async () => {
      const consumer = createConsumer(['email.send'])
      consumerRegistry.register(consumer)

      const batch = createMockBatch([
        { id: '1', type: 'unknown.type', payload: {} },
      ])

      await queueManager.processBatch('notifications-queue', batch)

      expect(consumer.handle).not.toHaveBeenCalled()
      expect(batch.messages[0].ack).toHaveBeenCalled()
      expect(mockStore.markProcessed).toHaveBeenCalledWith('1')
    })

    it('should route wildcard consumers', async () => {
      const consumer = createConsumer(['*'])
      consumerRegistry.register(consumer)

      const batch = createMockBatch([
        { id: '1', type: 'any.message.type', payload: {} },
      ])

      await queueManager.processBatch('events-queue', batch)

      expect(consumer.handle).toHaveBeenCalled()
    })

    it('should continue processing other consumers if one fails', async () => {
      const consumer1 = createConsumer(['email.send'])
      consumer1.handle.mockRejectedValue(new Error('Consumer 1 failed'))
      consumer1.onError!.mockResolvedValue(undefined)

      const consumer2 = createConsumer(['email.send'])

      consumerRegistry.register(consumer1)
      consumerRegistry.register(consumer2)

      const batch = createMockBatch([
        { id: '1', type: 'email.send', payload: {} },
      ])

      await queueManager.processBatch('notifications-queue', batch)

      expect(consumer1.handle).toHaveBeenCalled()
      expect(consumer2.handle).toHaveBeenCalled()
      expect(batch.messages[0].retry).toHaveBeenCalled()
    })

    it('should skip already-processed messages', async () => {
      mockStore.isProcessed.mockResolvedValue(true)
      const consumer = createConsumer(['email.send'])
      consumerRegistry.register(consumer)

      const batch = createMockBatch([
        { id: '1', type: 'email.send', payload: {} },
      ])

      await queueManager.processBatch('notifications-queue', batch)

      expect(consumer.handle).not.toHaveBeenCalled()
      expect(batch.messages[0].ack).toHaveBeenCalled()
    })

    it('should use custom idempotencyKey from metadata', async () => {
      const consumer = createConsumer(['order.process'])
      consumerRegistry.register(consumer)

      const batch = createMockBatch([
        {
          id: '1',
          type: 'order.process',
          payload: {},
          metadata: { idempotencyKey: 'order:123' },
        },
      ])

      await queueManager.processBatch('orders-queue', batch)

      expect(mockStore.isProcessed).toHaveBeenCalledWith('order:123')
      expect(mockStore.markProcessed).toHaveBeenCalledWith('order:123')
    })
  })
})
