import { describe, expect, it } from 'vitest'
import { parseDomainPattern } from '../middleware/domain.middleware'

describe('Domain Routing', () => {
  describe('parseDomainPattern', () => {
    it('should parse single param domain', () => {
      const { regex, paramNames } = parseDomainPattern('{tenant}.example.com')
      expect(paramNames).toEqual(['tenant'])
      expect(regex.test('acme.example.com')).toBe(true)
      expect(regex.test('example.com')).toBe(false)
    })

    it('should extract param value', () => {
      const { regex } = parseDomainPattern('{tenant}.example.com')
      const match = regex.exec('acme.example.com')
      expect(match?.[1]).toBe('acme')
    })

    it('should parse multiple params', () => {
      const { regex, paramNames } = parseDomainPattern('{region}.{tenant}.example.com')
      expect(paramNames).toEqual(['region', 'tenant'])

      const match = regex.exec('us-east.acme.example.com')
      expect(match?.[1]).toBe('us-east')
      expect(match?.[2]).toBe('acme')
    })

    it('should parse static domain (no params)', () => {
      const { regex, paramNames } = parseDomainPattern('admin.example.com')
      expect(paramNames).toEqual([])
      expect(regex.test('admin.example.com')).toBe(true)
      expect(regex.test('other.example.com')).toBe(false)
    })

    it('should not match partial domains', () => {
      const { regex } = parseDomainPattern('{tenant}.example.com')
      expect(regex.test('acme.example.com.evil.com')).toBe(false)
    })

    it('should not match missing subdomain', () => {
      const { regex } = parseDomainPattern('{tenant}.example.com')
      expect(regex.test('example.com')).toBe(false)
    })

    it('should handle underscored param names', () => {
      const { paramNames } = parseDomainPattern('{tenant_id}.example.com')
      expect(paramNames).toEqual(['tenant_id'])
    })
  })
})
