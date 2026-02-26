import { beforeEach, describe, expect, it } from 'vitest'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { ConsumerRegistry } from '../consumer-registry'
import { SyncQueueProvider } from '../providers/sync-queue.provider'
import type { IQueueConsumer, QueueMessage } from '../queue-consumer'

describe('SyncQueueProvider', () => {
  let provider: SyncQueueProvider
  let registry: ConsumerRegistry

  beforeEach(() => {
    registry = new ConsumerRegistry()
    provider = new SyncQueueProvider(registry)
  })

  const createMessage = <T>(type: string, payload: T): QueueMessage<T> => ({
    id: 'test-id-123',
    timestamp: Date.now(),
    type,
    payload,
  })

  const createConsumer = (messageTypes: string[]): DeepMocked<IQueueConsumer> => {
    const consumer = createMock<IQueueConsumer>({
      messageTypes,
    })
    consumer.handle.mockResolvedValue(undefined)
    return consumer
  }

  describe('send', () => {
    it('should find and call matching consumers by message type', async () => {
      const consumer = createConsumer(['email.send'])
      registry.register(consumer)

      const message = createMessage('email.send', { to: 'test@example.com' })
      await provider.send('notifications-queue', message)

      expect(consumer.handle).toHaveBeenCalledTimes(1)
      expect(consumer.handle).toHaveBeenCalledWith(message)
    })

    it('should support wildcard (*) message type handlers', async () => {
      const consumer = createConsumer(['*'])
      registry.register(consumer)

      const message = createMessage('any.message.type', { data: 'test' })
      await provider.send('notifications-queue', message)

      expect(consumer.handle).toHaveBeenCalledTimes(1)
      expect(consumer.handle).toHaveBeenCalledWith(message)
    })

    it('should call onError hook when consumer throws', async () => {
      const testError = new Error('Test error')
      const consumer = createConsumer(['email.send'])
      consumer.handle.mockRejectedValue(testError)
      consumer.onError!.mockResolvedValue(undefined)
      registry.register(consumer)

      const message = createMessage('email.send', { to: 'test@example.com' })

      await expect(
        provider.send('notifications-queue', message)
      ).rejects.toThrow('Test error')

      expect(consumer.onError).toHaveBeenCalledTimes(1)
      expect(consumer.onError).toHaveBeenCalledWith(testError, message)
    })

    it('should re-throw error after onError', async () => {
      const testError = new Error('Consumer failed')
      const consumer = createConsumer(['email.send'])
      consumer.handle.mockRejectedValue(testError)
      consumer.onError!.mockResolvedValue(undefined)
      registry.register(consumer)

      const message = createMessage('email.send', { to: 'test@example.com' })

      await expect(
        provider.send('notifications-queue', message)
      ).rejects.toThrow('Consumer failed')
    })

    it('should handle multiple matching consumers', async () => {
      const consumer1 = createConsumer(['email.send'])
      const consumer2 = createMock<IQueueConsumer>({
        messageTypes: ['email.send', 'email.batch.send'],
      })
      consumer2.handle.mockResolvedValue(undefined)

      registry.register(consumer1)
      registry.register(consumer2)

      const message = createMessage('email.send', { to: 'test@example.com' })
      await provider.send('notifications-queue', message)

      expect(consumer1.handle).toHaveBeenCalledTimes(1)
      expect(consumer2.handle).toHaveBeenCalledTimes(1)
    })

    it('should skip non-matching consumers', async () => {
      const matchingConsumer = createConsumer(['email.send'])
      const nonMatchingConsumer = createConsumer(['sms.send'])

      registry.register(matchingConsumer)
      registry.register(nonMatchingConsumer)

      const message = createMessage('email.send', { to: 'test@example.com' })
      await provider.send('notifications-queue', message)

      expect(matchingConsumer.handle).toHaveBeenCalledTimes(1)
      expect(nonMatchingConsumer.handle).not.toHaveBeenCalled()
    })

    it('should not call any consumer when message type has no registered consumers', async () => {
      const message = createMessage('unknown.type', { to: 'test@example.com' })

      // Should not throw, just do nothing
      await expect(
        provider.send('notifications-queue', message)
      ).resolves.toBeUndefined()
    })

    it('should convert non-Error throws to Error instances', async () => {
      const consumer = createConsumer(['email.send'])
      consumer.handle.mockRejectedValue('String error')
      consumer.onError!.mockResolvedValue(undefined)
      registry.register(consumer)

      const message = createMessage('email.send', { to: 'test@example.com' })

      await expect(
        provider.send('notifications-queue', message)
      ).rejects.toThrow('String error')

      expect(consumer.onError).toHaveBeenCalledWith(
        expect.any(Error),
        message
      )
    })

    it('should stop processing on first consumer error', async () => {
      const consumer1 = createConsumer(['email.send'])
      consumer1.handle.mockRejectedValue(new Error('First failed'))

      const consumer2 = createConsumer(['email.send'])

      registry.register(consumer1)
      registry.register(consumer2)

      const message = createMessage('email.send', { to: 'test@example.com' })

      await expect(
        provider.send('notifications-queue', message)
      ).rejects.toThrow('First failed')

      expect(consumer1.handle).toHaveBeenCalledTimes(1)
      expect(consumer2.handle).not.toHaveBeenCalled()
    })

    it('should route to same consumer from different queues', async () => {
      const consumer = createConsumer(['email.send'])
      registry.register(consumer)

      const message1 = createMessage('email.send', { to: 'a@example.com' })
      const message2 = createMessage('email.send', { to: 'b@example.com' })

      await provider.send('notifications-queue', message1)
      await provider.send('batch-notifications-queue', message2)

      // Same consumer handles messages from both queues
      expect(consumer.handle).toHaveBeenCalledTimes(2)
    })
  })
})
