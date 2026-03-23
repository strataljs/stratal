import { getRouteConfig } from 'stratal/router'
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

  it('should store route config metadata on the method', () => {
    const config = getRouteConfig(prototype, 'index')
    expect(config).toBeDefined()
  })

  it('should auto-set response schema matching InertiaPage shape', () => {
    const config = getRouteConfig(prototype, 'index')!
    const response = config.response as { schema: z.ZodType; description: string; contentType: string }

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
    const config = getRouteConfig(prototype, 'index')!
    expect(config.hideFromDocs).toBe(true)
  })

  it('should allow overriding hideFromDocs to false', () => {
    const config = getRouteConfig(prototype, 'visible')!
    expect(config.hideFromDocs).toBe(false)
  })

  it('should pass through query schema', () => {
    const config = getRouteConfig(prototype, 'list')!
    expect(config.query).toBeDefined()

    const result = (config.query as z.ZodType).safeParse({ page: '2' })
    expect(result.success).toBe(true)
  })

  it('should pass through params, body, tags, summary, and description', () => {
    const config = getRouteConfig(prototype, 'show')!

    expect(config.params).toBeDefined()
    expect(config.body).toBeDefined()
    expect(config.tags).toEqual(['Notes'])
    expect(config.summary).toBe('Show note')
    expect(config.description).toBe('Shows a note')
  })
})
