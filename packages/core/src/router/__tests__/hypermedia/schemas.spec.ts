import { describe, expect, it } from 'vitest'
import { z } from '../../../i18n/validation'
import { hypermediaLinkSchema, linksSchema, paginatedResourceSchema, resourceResponseSchema } from '../../hypermedia/schemas'

describe('Hypermedia Schemas', () => {
  describe('hypermediaLinkSchema', () => {
    it('should accept a minimal link with just href', () => {
      const result = hypermediaLinkSchema.safeParse({ href: '/users/123' })
      expect(result.success).toBe(true)
    })

    it('should accept a full link with all fields', () => {
      const result = hypermediaLinkSchema.safeParse({
        href: '/users/123',
        method: 'PUT',
        title: 'Update user',
        templated: false,
      })
      expect(result.success).toBe(true)
    })

    it('should reject a link without href', () => {
      const result = hypermediaLinkSchema.safeParse({ method: 'GET' })
      expect(result.success).toBe(false)
    })
  })

  describe('linksSchema', () => {
    it('should accept a map of links', () => {
      const result = linksSchema.safeParse({
        self: { href: '/users/123' },
        update: { href: '/users/123', method: 'PUT' },
      })
      expect(result.success).toBe(true)
    })
  })

  describe('resourceResponseSchema', () => {
    const userSchema = z.object({
      id: z.string(),
      name: z.string(),
    })

    it('should wrap a data schema in an envelope', () => {
      const schema = resourceResponseSchema(userSchema)
      const result = schema.safeParse({
        data: { id: '123', name: 'Alice' },
      })
      expect(result.success).toBe(true)
    })

    it('should accept optional _links', () => {
      const schema = resourceResponseSchema(userSchema)
      const result = schema.safeParse({
        data: { id: '123', name: 'Alice' },
        _links: {
          self: { href: '/users/123' },
        },
      })
      expect(result.success).toBe(true)
    })

    it('should accept optional _meta', () => {
      const schema = resourceResponseSchema(userSchema)
      const result = schema.safeParse({
        data: { id: '123', name: 'Alice' },
        _meta: { requestId: 'abc-123' },
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid data', () => {
      const schema = resourceResponseSchema(userSchema)
      const result = schema.safeParse({
        data: { id: 123 },
      })
      expect(result.success).toBe(false)
    })
  })

  describe('paginatedResourceSchema', () => {
    const itemSchema = z.object({ id: z.string() })

    it('should wrap items in a paginated envelope', () => {
      const schema = paginatedResourceSchema(itemSchema)
      const result = schema.safeParse({
        data: [{ id: '1' }, { id: '2' }],
        _meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
      })
      expect(result.success).toBe(true)
    })

    it('should accept optional _links', () => {
      const schema = paginatedResourceSchema(itemSchema)
      const result = schema.safeParse({
        data: [{ id: '1' }],
        _links: {
          self: { href: '/items?page=1&limit=20' },
          next: { href: '/items?page=2&limit=20' },
        },
        _meta: { page: 1, limit: 20, total: 50, totalPages: 3 },
      })
      expect(result.success).toBe(true)
    })

    it('should accept extra keys in _meta', () => {
      const schema = paginatedResourceSchema(itemSchema)
      const result = schema.safeParse({
        data: [],
        _meta: { page: 1, limit: 20, total: 0, totalPages: 0, customKey: 'value' },
      })
      expect(result.success).toBe(true)
    })

    it('should reject when _meta is missing required pagination fields', () => {
      const schema = paginatedResourceSchema(itemSchema)
      const result = schema.safeParse({
        data: [],
        _meta: { page: 1 },
      })
      expect(result.success).toBe(false)
    })
  })
})
