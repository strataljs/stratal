import { describe, expect, it } from 'vitest'
import { signUrl, verifySignedUrl } from '../signed-url'

const TEST_SECRET = 'test-secret-key-for-hmac'

describe('Signed URLs', () => {
  describe('signUrl', () => {
    it('should add signature query param', async () => {
      const signed = await signUrl('/unsubscribe?user=1', TEST_SECRET)
      expect(signed).toContain('signature=')
      expect(signed).toContain('/unsubscribe')
    })

    it('should add expires param when expiresIn is set', async () => {
      const signed = await signUrl('/confirm', TEST_SECRET, { expiresIn: 3600 })
      expect(signed).toContain('expires=')
      expect(signed).toContain('signature=')
    })

    it('should handle absolute URLs', async () => {
      const signed = await signUrl('https://example.com/confirm', TEST_SECRET)
      expect(signed.startsWith('https://example.com/confirm')).toBe(true)
      expect(signed).toContain('signature=')
    })
  })

  describe('verifySignedUrl', () => {
    it('should verify a valid signature', async () => {
      const signed = await signUrl('/unsubscribe?user=1', TEST_SECRET)
      const isValid = await verifySignedUrl(signed, TEST_SECRET)
      expect(isValid).toBe(true)
    })

    it('should reject tampered URL', async () => {
      const signed = await signUrl('/unsubscribe?user=1', TEST_SECRET)
      const tampered = signed.replace('user=1', 'user=2')
      const isValid = await verifySignedUrl(tampered, TEST_SECRET)
      expect(isValid).toBe(false)
    })

    it('should reject wrong secret', async () => {
      const signed = await signUrl('/confirm', TEST_SECRET)
      const isValid = await verifySignedUrl(signed, 'wrong-secret')
      expect(isValid).toBe(false)
    })

    it('should reject missing signature', async () => {
      const isValid = await verifySignedUrl('/confirm?user=1', TEST_SECRET)
      expect(isValid).toBe(false)
    })

    it('should reject expired URL', async () => {
      // Sign with 0 seconds expiry (already expired)
      const signed = await signUrl('/confirm', TEST_SECRET, { expiresIn: -1 })
      const isValid = await verifySignedUrl(signed, TEST_SECRET)
      expect(isValid).toBe(false)
    })

    it('should accept non-expired URL', async () => {
      const signed = await signUrl('/confirm', TEST_SECRET, { expiresIn: 3600 })
      const isValid = await verifySignedUrl(signed, TEST_SECRET)
      expect(isValid).toBe(true)
    })

    it('should verify URL with existing query params', async () => {
      const signed = await signUrl('/users?page=2&limit=10', TEST_SECRET)
      const isValid = await verifySignedUrl(signed, TEST_SECRET)
      expect(isValid).toBe(true)
    })

    it('should verify absolute URLs', async () => {
      const signed = await signUrl('https://example.com/confirm?token=abc', TEST_SECRET)
      const isValid = await verifySignedUrl(signed, TEST_SECRET)
      expect(isValid).toBe(true)
    })
  })
})
