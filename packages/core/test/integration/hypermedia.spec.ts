import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HypermediaAppModule } from '../fixtures/hypermedia.controller'

describe('Hypermedia', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [HypermediaAppModule],
    }).compile()
  })

  afterAll(async () => {
    await module.close()
  })

  describe('Single resource', () => {
    it('GET /api/resources/:id returns resource envelope with _links', async () => {
      const response = await module.http
        .get('/api/resources/abc-123')
        .send()

      response.assertOk()
      await response.assertJsonPath('data.id', 'abc-123')
      await response.assertJsonPath('data.name', 'Test Item')
      await response.assertJsonPathMatches('_links', (links) =>
        links != null && typeof links === 'object',
      )
      await response.assertJsonPathMatches('_links.self.href', (href) =>
        href === '/api/resources/abc-123',
      )
      await response.assertJsonPathMatches('_links.collection.href', (href) =>
        href === '/api/resources',
      )
      await response.assertJsonPathMatches('_links.create', (link) => {
        const l = link as { href: string; method: string }
        return l.href === '/api/resources' && l.method === 'POST'
      })
    })
  })

  describe('Paginated collection', () => {
    it('GET /api/resources returns paginated envelope with _meta and _links', async () => {
      const response = await module.http
        .get('/api/resources?page=1&limit=10')
        .send()

      response.assertOk()
      await response.assertJsonPathMatches('data', (data) =>
        Array.isArray(data) && data.length === 2,
      )
      await response.assertJsonPath('_meta.page', 1)
      await response.assertJsonPath('_meta.limit', 10)
      await response.assertJsonPath('_meta.total', 2)
      await response.assertJsonPath('_meta.totalPages', 1)
      await response.assertJsonPathMatches('_links.self.href', (href) =>
        typeof href === 'string' && href.includes('page=1') && href.includes('limit=10'),
      )
      await response.assertJsonPathMatches('_links.first.href', (href) =>
        typeof href === 'string' && href.includes('page=1'),
      )
    })
  })

  describe('Plain JSON', () => {
    it('GET /api/plain returns plain JSON without envelope', async () => {
      const response = await module.http
        .get('/api/plain')
        .send()

      response.assertOk()
      await response.assertJsonPath('status', 'ok')

      const json = await response.json<Record<string, unknown>>()
      expect(json).not.toHaveProperty('data')
      expect(json).not.toHaveProperty('_links')
    })
  })

  describe('Cross-controller links', () => {
    it('GET /api/related/:id has _links.resources pointing to /api/resources', async () => {
      const response = await module.http
        .get('/api/related/rel-456')
        .send()

      response.assertOk()
      await response.assertJsonPath('data.id', 'rel-456')
      await response.assertJsonPathMatches('_links.resources.href', (href) =>
        href === '/api/resources',
      )
    })
  })

  describe('Cursor-paginated collection', () => {
    it('first page returns cursor envelope with next link', async () => {
      const response = await module.http
        .get('/api/cursored?limit=20')
        .send()

      response.assertOk()
      await response.assertJsonPathMatches('data', (data) =>
        Array.isArray(data) && data.length === 2,
      )
      await response.assertJsonPath('_meta.hasMore', true)
      await response.assertJsonPath('_meta.nextCursor', 'cursor-after-2')
      await response.assertJsonPathMatches('_links.self.href', (href) =>
        typeof href === 'string' && href.includes('/api/cursored') && href.includes('limit=20'),
      )
      await response.assertJsonPathMatches('_links.next.href', (href) =>
        typeof href === 'string' && href.includes('cursor=cursor-after-2') && href.includes('limit=20'),
      )
    })

    it('last page omits next link and nextCursor', async () => {
      const response = await module.http
        .get('/api/cursored?cursor=cursor-after-2&limit=20')
        .send()

      response.assertOk()
      await response.assertJsonPathMatches('data', (data) =>
        Array.isArray(data) && data.length === 1 && (data as { id: string }[])[0].id === '3',
      )
      await response.assertJsonPath('_meta.hasMore', false)

      const json = await response.json<Record<string, unknown>>()
      const meta = json._meta as Record<string, unknown>
      const links = json._links as Record<string, unknown>
      expect(meta).not.toHaveProperty('nextCursor')
      expect(links).not.toHaveProperty('next')
    })

    it('extra query params preserved in links', async () => {
      const response = await module.http
        .get('/api/cursored?limit=10&status=active')
        .send()

      response.assertOk()
      await response.assertJsonPathMatches('_links.self.href', (href) =>
        typeof href === 'string' && href.includes('status=active'),
      )
      await response.assertJsonPathMatches('_links.next.href', (href) =>
        typeof href === 'string' && href.includes('status=active'),
      )
    })
  })

  describe('Non-envelope route', () => {
    it('POST /api/resources returns plain ctx.json() response', async () => {
      const response = await module.http
        .post('/api/resources')
        .withBody({})
        .send()

      response.assertCreated()
      await response.assertJsonPath('id', '1')
      await response.assertJsonPath('name', 'Created')

      const json = await response.json<Record<string, unknown>>()
      expect(json).not.toHaveProperty('data')
      expect(json).not.toHaveProperty('_links')
    })
  })
})
