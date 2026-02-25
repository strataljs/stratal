import { describe, expect, it } from 'vitest'
import { emailMessageSchema } from '../contracts/email-message.contract'

describe('emailMessageSchema', () => {
  const validBase = {
    to: 'test@example.com',
    subject: 'Test Subject',
  }

  describe('refine: html or text required', () => {
    it('should reject when html is empty string and text is undefined', () => {
      const result = emailMessageSchema.safeParse({
        ...validBase,
        html: '',
      })
      expect(result.success).toBe(false)
    })

    it('should accept when html has content', () => {
      const result = emailMessageSchema.safeParse({
        ...validBase,
        html: '<p>Hello</p>',
      })
      expect(result.success).toBe(true)
    })

    it('should accept when text has content and html is undefined', () => {
      const result = emailMessageSchema.safeParse({
        ...validBase,
        text: 'Hello',
      })
      expect(result.success).toBe(true)
    })

    it('should reject when both html and text are undefined', () => {
      const result = emailMessageSchema.safeParse(validBase)
      expect(result.success).toBe(false)
    })
  })
})
