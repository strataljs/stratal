import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResolvedEmailMessage } from '../contracts'
import type { EmailModuleOptions } from '../email.module'
import { EmailError } from '../email.error'
import { SmtpProvider } from '../providers/smtp.provider'

const mockSmtpSend = vi.fn().mockResolvedValue({ messageId: 'test-msg-id' })

vi.mock('../smtp/smtp-client', () => ({
  SmtpClient: class {
    send = mockSmtpSend
  },
}))

vi.mock('../smtp/mime', () => ({
  buildMimeMessage: vi.fn().mockResolvedValue({
    raw: 'Subject: Test\r\n\r\nHello',
    envelope: { from: 'noreply@example.com', to: ['user@example.com'] },
  }),
}))

import { buildMimeMessage } from '../smtp/mime'

describe('SmtpProvider', () => {
  const options: EmailModuleOptions = {
    from: { name: 'Test', email: 'noreply@example.com' },
    smtp: { url: 'smtp://user:pass@smtp.example.com:587' },
    queue: 'email',
  }

  let provider: SmtpProvider

  beforeEach(() => {
    vi.clearAllMocks()
    provider = new SmtpProvider(options)
  })

  it('should throw if smtp config is missing', () => {
    expect(() => new SmtpProvider({ ...options, smtp: undefined as any })).toThrow(EmailError)
  })

  it('should throw if smtp url is empty', () => {
    expect(() => new SmtpProvider({ ...options, smtp: { url: '' } })).toThrow(EmailError)
  })

  describe('send()', () => {
    it('should build MIME message and send via SmtpClient', async () => {
      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
      }

      const result = await provider.send(message)

      expect(buildMimeMessage).toHaveBeenCalledWith(message, options.from)
      expect(result.accepted).toBe(true)
      expect(result.messageId).toBe('test-msg-id')
      expect(result.metadata).toEqual({ provider: 'smtp' })
    })

    it('should handle single recipient', async () => {
      const message: ResolvedEmailMessage = {
        to: 'single@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      }

      const result = await provider.send(message)

      expect(result.accepted).toBe(true)
    })

    it('should handle array recipients', async () => {
      const message: ResolvedEmailMessage = {
        to: ['a@example.com', 'b@example.com'],
        subject: 'Test',
        html: '<p>Hi</p>',
      }

      const result = await provider.send(message)

      expect(result.accepted).toBe(true)
    })

    it('should use message from when provided', async () => {
      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        from: { name: 'Custom', email: 'custom@example.com' },
      }

      await provider.send(message)

      expect(buildMimeMessage).toHaveBeenCalledWith(message, options.from)
    })

    it('should throw EmailError on SMTP failure', async () => {
      mockSmtpSend.mockRejectedValueOnce(new Error('Connection refused'))

      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      }

      await expect(provider.send(message)).rejects.toThrow(EmailError)
    })
  })
})
