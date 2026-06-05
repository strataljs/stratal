import { createMock, type DeepMocked } from '@stratal/testing/mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Application } from '../../application';
import { Container } from '../../di/container';
import { runWithContainer } from '../../di/container-storage';
import type { Constructor } from '../../types';
import { ConsumerRegistry } from '../consumer-registry';
import { SyncQueueProvider } from '../providers/sync-queue.provider';
import type { IQueueConsumer, QueueMessage } from '../queue-consumer';

describe('SyncQueueProvider', () => {
  let provider: SyncQueueProvider
  let registry: ConsumerRegistry
  let instances: Map<Constructor<IQueueConsumer>, IQueueConsumer>
  let scope: Container
  let app: Application
  let ensureScopedHandlersCalls: number

  beforeEach(() => {
    registry = new ConsumerRegistry()
    instances = new Map()
    scope = {
      resolve: (token: Constructor<IQueueConsumer>) => instances.get(token),
    } as unknown as Container
    ensureScopedHandlersCalls = 0
    app = {
      ensureScopedHandlers: () => {
        ensureScopedHandlersCalls += 1
        return Promise.resolve()
      },
    } as unknown as Application
    // `root` is only used when there is no ambient scope; these tests wrap send()
    // in runWithContainer(scope), so the ambient path is exercised.
    provider = new SyncQueueProvider(registry, scope, app)
  })

  const createMessage = <T>(type: string, payload: T): QueueMessage<T> => ({
    id: 'test-id-123',
    type,
    payload,
  })

  // Register a mock consumer instance behind a throwaway class token, and make
  // the ambient scope resolve that token to the instance (consumers are resolved
  // per message from the request scope in production).
  const register = (consumer: IQueueConsumer): void => {
    const token = class {} as unknown as Constructor<IQueueConsumer>
    instances.set(token, consumer)
    registry.register(token, consumer.messageTypes)
  }

  const send = <T>(binding: string, message: QueueMessage<T>): Promise<void> =>
    runWithContainer(scope, () => provider.send(binding, message))

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
      register(consumer)

      const message = createMessage('email.send', { to: 'test@example.com' })
      await send('notifications-queue', message)

      expect(consumer.handle).toHaveBeenCalledTimes(1)
      expect(consumer.handle).toHaveBeenCalledWith(message)
    })

    it('should support wildcard (*) message type handlers', async () => {
      const consumer = createConsumer(['*'])
      register(consumer)

      const message = createMessage('any.message.type', { data: 'test' })
      await send('notifications-queue', message)

      expect(consumer.handle).toHaveBeenCalledTimes(1)
      expect(consumer.handle).toHaveBeenCalledWith(message)
    })

    it('should call onError hook when consumer throws', async () => {
      const testError = new Error('Test error')
      const consumer = createConsumer(['email.send'])
      consumer.handle.mockRejectedValue(testError)
      consumer.onError!.mockResolvedValue(undefined)
      register(consumer)

      const message = createMessage('email.send', { to: 'test@example.com' })

      await expect(
        send('notifications-queue', message)
      ).rejects.toThrow('Test error')

      expect(consumer.onError).toHaveBeenCalledTimes(1)
      expect(consumer.onError).toHaveBeenCalledWith(testError, message)
    })

    it('should re-throw error after onError', async () => {
      const testError = new Error('Consumer failed')
      const consumer = createConsumer(['email.send'])
      consumer.handle.mockRejectedValue(testError)
      consumer.onError!.mockResolvedValue(undefined)
      register(consumer)

      const message = createMessage('email.send', { to: 'test@example.com' })

      await expect(
        send('notifications-queue', message)
      ).rejects.toThrow('Consumer failed')
    })

    it('should handle multiple matching consumers', async () => {
      const consumer1 = createConsumer(['email.send'])
      const consumer2 = createMock<IQueueConsumer>({
        messageTypes: ['email.send', 'email.batch.send'],
      })
      consumer2.handle.mockResolvedValue(undefined)

      register(consumer1)
      register(consumer2)

      const message = createMessage('email.send', { to: 'test@example.com' })
      await send('notifications-queue', message)

      expect(consumer1.handle).toHaveBeenCalledTimes(1)
      expect(consumer2.handle).toHaveBeenCalledTimes(1)
    })

    it('should skip non-matching consumers', async () => {
      const matchingConsumer = createConsumer(['email.send'])
      const nonMatchingConsumer = createConsumer(['sms.send'])

      register(matchingConsumer)
      register(nonMatchingConsumer)

      const message = createMessage('email.send', { to: 'test@example.com' })
      await send('notifications-queue', message)

      expect(matchingConsumer.handle).toHaveBeenCalledTimes(1)
      expect(nonMatchingConsumer.handle).not.toHaveBeenCalled()
    })

    it('should not call any consumer when message type has no registered consumers', async () => {
      const message = createMessage('unknown.type', { to: 'test@example.com' })

      // Should not throw, just do nothing
      await expect(
        send('notifications-queue', message)
      ).resolves.toBeUndefined()
    })

    it('should convert non-Error throws to Error instances', async () => {
      const consumer = createConsumer(['email.send'])
      consumer.handle.mockRejectedValue('String error')
      consumer.onError!.mockResolvedValue(undefined)
      register(consumer)

      const message = createMessage('email.send', { to: 'test@example.com' })

      await expect(
        send('notifications-queue', message)
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

      register(consumer1)
      register(consumer2)

      const message = createMessage('email.send', { to: 'test@example.com' })

      await expect(
        send('notifications-queue', message)
      ).rejects.toThrow('First failed')

      expect(consumer1.handle).toHaveBeenCalledTimes(1)
      expect(consumer2.handle).not.toHaveBeenCalled()
    })

    it('should route to same consumer from different queues', async () => {
      const consumer = createConsumer(['email.send'])
      register(consumer)

      const message1 = createMessage('email.send', { to: 'a@example.com' })
      const message2 = createMessage('email.send', { to: 'b@example.com' })

      await send('notifications-queue', message1)
      await send('batch-notifications-queue', message2)

      // Same consumer handles messages from both queues
      expect(consumer.handle).toHaveBeenCalledTimes(2)
    })

    it('establishes its own request scope when dispatched with no ambient scope', async () => {
      // Regression: dispatching from a service called directly in a test (no
      // surrounding runInScope) must still process — the provider creates its
      // own request scope and resolves the consumer from it.
      const handled: string[] = []
      class RealConsumer implements IQueueConsumer {
        readonly messageTypes = ['email.send']
        async handle(message: QueueMessage): Promise<void> {
          handled.push((message.payload as { to: string }).to)
          return Promise.resolve()
        }
      }

      const root = new Container()
      root.register(RealConsumer)
      registry.register(RealConsumer, ['email.send'])
      const realProvider = new SyncQueueProvider(registry, root, app)

      // No runWithContainer wrapper: getStore() is undefined here.
      await realProvider.send('q', createMessage('email.send', { to: 'a@example.com' }))

      expect(handled).toEqual(['a@example.com'])
    })

    it('initializes the queue subsystem before matching consumers', async () => {
      // The fetch path skips queue init (a Cloudflare-queue worker never runs
      // consumers inline) — the sync provider IS the inline path, so it must
      // populate the consumer registry itself or every dispatch silently drops.
      await runWithContainer(scope, () =>
        provider.send('q', createMessage('any.type', {})),
      )

      expect(ensureScopedHandlersCalls).toBe(1)
    })
  })
})
