import { type ConventionRouteMetadata, getRouteMetadata } from 'stratal/router'
import { z } from 'stratal/validation'
import { describe, expect, it } from 'vitest'
import { InertiaRoute } from '../decorators/inertia-route.decorator'

class TestController {
  @InertiaRoute()
  index() {
    //
  }

  @InertiaRoute({ query: z.object({ page: z.string().optional() }) })
  list() {
    //
  }

  @InertiaRoute({ hideFromDocs: false })
  visible() {
    //
  }

  @InertiaRoute({
    params: z.object({ id: z.string() }),
    body: z.object({ title: z.string() }),
    tags: ['Notes'],
    summary: 'Show note',
    description: 'Shows a note',
  })
  show() {
    //
  }
}

describe('InertiaRoute decorator', () => {
  const prototype = TestController.prototype

  it('should store route metadata with convention type', () => {
    const meta = getRouteMetadata(prototype, 'index')
    expect(meta).toBeDefined()
    expect(meta!.type).toBe('convention')
  })

  it('should auto-set response schema matching InertiaPage shape', () => {
    const meta = getRouteMetadata(prototype, 'index') as ConventionRouteMetadata
    const response = meta.config.response as { schema: z.ZodType; description: string; contentType: string }

    expect(response.description).toBe('Inertia page response')
    expect(response.contentType).toBe('text/html')

    // Verify the schema shape matches InertiaPage
    const validPage = {
      component: 'Home',
      props: { foo: 'bar' },
      url: '/',
      version: '1',
      mergeProps: [],
      deferredProps: {},
      encryptHistory: false,
      clearHistory: false,
    }
    expect(response.schema.safeParse(validPage).success).toBe(true)
  })

  it('should default hideFromDocs to true', () => {
    const meta = getRouteMetadata(prototype, 'index') as ConventionRouteMetadata
    expect(meta.config.hideFromDocs).toBe(true)
  })

  it('should allow overriding hideFromDocs to false', () => {
    const meta = getRouteMetadata(prototype, 'visible') as ConventionRouteMetadata
    expect(meta.config.hideFromDocs).toBe(false)
  })

  it('should pass through query schema', () => {
    const meta = getRouteMetadata(prototype, 'list') as ConventionRouteMetadata

    expect(meta.config.query).toBeDefined()

    const result = (meta.config.query as z.ZodType).safeParse({ page: '2' })
    expect(result.success).toBe(true)
  })

  it('should pass through params, body, tags, summary, and description', () => {
    const meta = getRouteMetadata(prototype, 'show') as ConventionRouteMetadata

    expect(meta.config.params).toBeDefined()
    expect(meta.config.body).toBeDefined()
    expect(meta.config.tags).toEqual(['Notes'])
    expect(meta.config.summary).toBe('Show note')
    expect(meta.config.description).toBe('Shows a note')
  })
})
