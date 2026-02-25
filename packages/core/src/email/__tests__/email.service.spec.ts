import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import type { IQueueSender } from '../../queue/queue-sender.interface'
import { EmailService } from '../services/email.service'

// Mock @react-email/render
vi.mock('@react-email/render', () => ({
  render: vi.fn().mockResolvedValue('<html>rendered</html>'),
}))

import { render } from '@react-email/render'

describe('EmailService', () => {
  let service: EmailService
  let mockQueue: DeepMocked<IQueueSender>

  beforeEach(() => {
    vi.clearAllMocks()

    mockQueue = createMock<IQueueSender>()
    mockQueue.dispatch.mockResolvedValue(undefined)

    service = new EmailService(mockQueue as unknown as IQueueSender)
  })

  describe('send()', () => {
    it('should dispatch to queue with type "email.send"', async () => {
      const template = { type: 'div', props: {} } as unknown as ReactElement

      await service.send({
        to: 'user@example.com',
        subject: 'Test',
        template,
      })

      expect(mockQueue.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'email.send',
        })
      )
    })

    it('should render React template to HTML via render()', async () => {
      const template = { type: 'div', props: {} } as unknown as ReactElement

      await service.send({
        to: 'user@example.com',
        subject: 'Test',
        template,
      })

      expect(render).toHaveBeenCalledWith(template)
      expect(mockQueue.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            html: '<html>rendered</html>',
          }),
        })
      )
    })

    it('should pass payload fields to queue', async () => {
      const template = { type: 'div', props: {} } as unknown as ReactElement

      await service.send({
        to: 'user@example.com',
        subject: 'Welcome',
        from: { email: 'sender@example.com' },
        template,
      })

      expect(mockQueue.dispatch).toHaveBeenCalledWith({
        type: 'email.send',
        payload: {
          to: 'user@example.com',
          subject: 'Welcome',
          from: { email: 'sender@example.com' },
          html: '<html>rendered</html>',
        },
      })
    })

    it('should pass undefined html when no template provided', async () => {
      await service.send({
        to: 'user@example.com',
        subject: 'Test',
        template: undefined!,
      })

      expect(mockQueue.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            html: undefined,
          }),
        })
      )
    })
  })

  describe('sendBatch()', () => {
    it('should call send() for each message in order', async () => {
      const template1 = { type: 'div', props: { id: 1 } } as unknown as ReactElement
      const template2 = { type: 'div', props: { id: 2 } } as unknown as ReactElement

      await service.sendBatch({
        messages: [
          { to: 'user1@example.com', subject: 'Test 1', template: template1 },
          { to: 'user2@example.com', subject: 'Test 2', template: template2 },
        ],
      })

      expect(mockQueue.dispatch).toHaveBeenCalledTimes(2)

      expect(mockQueue.dispatch).toHaveBeenNthCalledWith(1,
        expect.objectContaining({
          type: 'email.send',
          payload: expect.objectContaining({
            to: 'user1@example.com',
            subject: 'Test 1',
          }),
        })
      )

      expect(mockQueue.dispatch).toHaveBeenNthCalledWith(2,
        expect.objectContaining({
          type: 'email.send',
          payload: expect.objectContaining({
            to: 'user2@example.com',
            subject: 'Test 2',
          }),
        })
      )
    })
  })
})
