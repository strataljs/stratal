import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import type { II18nService } from '../../i18n/i18n.types'
import type { IQueueProvider } from '../providers'
import { QueueSender } from '../queue-sender'

describe('QueueSender', () => {
  let sender: QueueSender
  let mockProvider: DeepMocked<IQueueProvider>
  let mockI18n: DeepMocked<II18nService>

  beforeEach(() => {
    vi.clearAllMocks()
    mockProvider = createMock<IQueueProvider>()
    mockProvider.send.mockResolvedValue(undefined)
    mockI18n = createMock<II18nService>()
    mockI18n.getLocale.mockReturnValue('')
    sender = new QueueSender('TEST_QUEUE', mockProvider as unknown as IQueueProvider, mockI18n as unknown as II18nService)
  })

  describe('dispatch', () => {
    it('should auto-generate a deterministic idempotencyKey', async () => {
      await sender.dispatch({
        type: 'email.send',
        payload: { to: 'user@example.com' },
      })

      const sent = mockProvider.send.mock.calls[0][1]
      expect(sent.metadata?.idempotencyKey).toMatch(/^queue:[a-f0-9]{64}$/)
    })

    it('should produce the same key for identical type + payload', async () => {
      const message = { type: 'email.send', payload: { to: 'user@example.com' } }

      await sender.dispatch(message)
      await sender.dispatch(message)

      const key1 = mockProvider.send.mock.calls[0][1].metadata?.idempotencyKey
      const key2 = mockProvider.send.mock.calls[1][1].metadata?.idempotencyKey
      expect(key1).toBe(key2)
    })

    it('should produce different keys for different payloads', async () => {
      await sender.dispatch({ type: 'email.send', payload: { to: 'a@example.com' } })
      await sender.dispatch({ type: 'email.send', payload: { to: 'b@example.com' } })

      const key1 = mockProvider.send.mock.calls[0][1].metadata?.idempotencyKey
      const key2 = mockProvider.send.mock.calls[1][1].metadata?.idempotencyKey
      expect(key1).not.toBe(key2)
    })

    it('should produce different keys for different types', async () => {
      await sender.dispatch({ type: 'email.send', payload: { to: 'a@example.com' } })
      await sender.dispatch({ type: 'sms.send', payload: { to: 'a@example.com' } })

      const key1 = mockProvider.send.mock.calls[0][1].metadata?.idempotencyKey
      const key2 = mockProvider.send.mock.calls[1][1].metadata?.idempotencyKey
      expect(key1).not.toBe(key2)
    })

    it('should preserve caller-provided idempotencyKey', async () => {
      await sender.dispatch({
        type: 'order.process',
        payload: { orderId: '123' },
        metadata: { idempotencyKey: 'order:123' },
      })

      const sent = mockProvider.send.mock.calls[0][1]
      expect(sent.metadata?.idempotencyKey).toBe('order:123')
    })

    it('should generate a UUID for message id', async () => {
      await sender.dispatch({ type: 'test', payload: {} })

      const sent = mockProvider.send.mock.calls[0][1]
      expect(sent.id).toMatch(/^[a-f0-9-]{36}$/)
    })

    it('should set locale from i18n context', async () => {
      mockI18n.getLocale.mockReturnValue('fr')

      await sender.dispatch({ type: 'test', payload: {} })

      const sent = mockProvider.send.mock.calls[0][1]
      expect(sent.metadata?.locale).toBe('fr')
    })

    it('should not override caller-provided locale', async () => {
      mockI18n.getLocale.mockReturnValue('fr')

      await sender.dispatch({ type: 'test', payload: {}, metadata: { locale: 'de' } })

      const sent = mockProvider.send.mock.calls[0][1]
      expect(sent.metadata?.locale).toBe('de')
    })

    it('should send to the correct binding', async () => {
      await sender.dispatch({ type: 'test', payload: {} })

      expect(mockProvider.send).toHaveBeenCalledWith('TEST_QUEUE', expect.any(Object))
    })
  })
})
