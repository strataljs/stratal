import { type ConventionRouteMetadata, type ExplicitRouteMetadata, getRouteDecoratedMethods, getRouteMetadata } from 'stratal/router'
import { z } from 'stratal/validation'
import { describe, expect, it } from 'vitest'
import { InertiaDelete, InertiaGet, InertiaPatch, InertiaPost, InertiaPut, InertiaRoute } from '../decorators/inertia.decorators'

class ConventionTestController {
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

class ExplicitTestController {
  @InertiaGet('/')
  index() {
    //
  }

  @InertiaGet('/:id', { params: z.object({ id: z.string() }) })
  show() {
    //
  }

  @InertiaPost('/', { body: z.object({ title: z.string() }) })
  create() {
    //
  }

  @InertiaPut('/:id', { params: z.object({ id: z.string() }), body: z.object({ title: z.string() }) })
  update() {
    //
  }

  @InertiaPatch('/:id', { params: z.object({ id: z.string() }) })
  patch() {
    //
  }

  @InertiaDelete('/:id', { params: z.object({ id: z.string() }) })
  destroy() {
    //
  }

  @InertiaGet('/visible', { hideFromDocs: false })
  visible() {
    //
  }
}

const validPage = {
  component: 'Home',
  props: { foo: 'bar', errors: {} },
  url: '/',
  version: '1',
  flash: {},
  rememberedState: {},
}

describe('InertiaRoute decorator (convention)', () => {
  const prototype = ConventionTestController.prototype

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

describe('Inertia HTTP method decorators (explicit)', () => {
  const prototype = ExplicitTestController.prototype

  it('should store explicit route metadata with correct HTTP methods', () => {
    const methods: Record<string, string> = {
      index: 'get',
      show: 'get',
      create: 'post',
      update: 'put',
      patch: 'patch',
      destroy: 'delete',
    }

    for (const [methodName, httpMethod] of Object.entries(methods)) {
      const meta = getRouteMetadata(prototype, methodName) as ExplicitRouteMetadata
      expect(meta).toBeDefined()
      expect(meta.type).toBe('explicit')
      expect(meta.method).toBe(httpMethod)
    }
  })

  it('should store correct paths', () => {
    const paths: Record<string, string> = {
      index: '/',
      show: '/:id',
      create: '/',
      update: '/:id',
      patch: '/:id',
      destroy: '/:id',
    }

    for (const [methodName, path] of Object.entries(paths)) {
      const meta = getRouteMetadata(prototype, methodName) as ExplicitRouteMetadata
      expect(meta.path).toBe(path)
    }
  })

  it('should auto-set inertia response schema on all methods', () => {
    for (const methodName of ['index', 'show', 'create', 'update', 'patch', 'destroy']) {
      const meta = getRouteMetadata(prototype, methodName) as ExplicitRouteMetadata
      const response = meta.config.response as { schema: z.ZodType; description: string; contentType: string }

      expect(response.description).toBe('Inertia page response')
      expect(response.contentType).toBe('text/html')
      expect(response.schema.safeParse(validPage).success).toBe(true)
    }
  })

  it('should default hideFromDocs to true', () => {
    const meta = getRouteMetadata(prototype, 'index') as ExplicitRouteMetadata
    expect(meta.config.hideFromDocs).toBe(true)
  })

  it('should allow overriding hideFromDocs to false', () => {
    const meta = getRouteMetadata(prototype, 'visible') as ExplicitRouteMetadata
    expect(meta.config.hideFromDocs).toBe(false)
  })

  it('should pass through params and body schemas', () => {
    const showMeta = getRouteMetadata(prototype, 'show') as ExplicitRouteMetadata
    expect(showMeta.config.params).toBeDefined()

    const createMeta = getRouteMetadata(prototype, 'create') as ExplicitRouteMetadata
    expect(createMeta.config.body).toBeDefined()

    const updateMeta = getRouteMetadata(prototype, 'update') as ExplicitRouteMetadata
    expect(updateMeta.config.params).toBeDefined()
    expect(updateMeta.config.body).toBeDefined()
  })

  it('should track all methods in DECORATED_METHODS', () => {
    const methods = getRouteDecoratedMethods(ExplicitTestController as unknown as new (...args: unknown[]) => object)
    expect(methods).toContain('index')
    expect(methods).toContain('show')
    expect(methods).toContain('create')
    expect(methods).toContain('update')
    expect(methods).toContain('patch')
    expect(methods).toContain('destroy')
    expect(methods).toContain('visible')
  })
})
