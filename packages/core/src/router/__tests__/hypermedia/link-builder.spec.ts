import { describe, expect, it } from 'vitest'
import { ROUTER_CONTEXT_KEYS } from '../../constants'
import { Controller } from '../../decorators/controller.decorator'
import { LinkBuilder } from '../../hypermedia/link-builder.service'
import type { RouterContext } from '../../router-context'

// --- Fixture controllers ---

@Controller('/users')
class FullCrudController {
  index() {
    //
  }
  show() {
    //
  }
  create() {
    //
  }
  update() {
    //
  }
  destroy() {
    //
  }
}

@Controller('/users')
class ReadOnlyController {
  index() {
    //
  }
  show() {
    //
  }
}

@Controller('/posts')
class PostsReadOnlyController {
  index() {
    //
  }
  show() {
    //
  }
}

@Controller('/posts')
class PostsIndexController {
  index() {
    //
  }
}

@Controller('/users', { version: '1' })
class VersionedController {
  show() {
    //
  }
}

@Controller('/users', { version: ['1', '2'] })
class MultiVersionController {
  show() {
    //
  }
}


// --- Helpers ---

function createMockRouterContext(url: string, currentController?: unknown): RouterContext {
  const contextStore = new Map<string, unknown>()
  if (currentController) {
    contextStore.set(ROUTER_CONTEXT_KEYS.CURRENT_CONTROLLER, currentController)
  }

  return {
    c: {
      req: { url },
      get: (key: string) => contextStore.get(key),
    },
  } as unknown as RouterContext
}

describe('LinkBuilder', () => {
  describe('self()', () => {
    it('should return current request URL as href', () => {
      const ctx = createMockRouterContext('http://localhost:8787/users/123?include=posts')
      const builder = new LinkBuilder(ctx)

      expect(builder.self()).toEqual({ href: '/users/123?include=posts' })
    })

    it('should return path without query when none present', () => {
      const ctx = createMockRouterContext('http://localhost:8787/users')
      const builder = new LinkBuilder(ctx)

      expect(builder.self()).toEqual({ href: '/users' })
    })
  })

  describe('action()', () => {
    it('should resolve path for explicit controller with RESTful convention', () => {
      const ctx = createMockRouterContext('http://localhost:8787/users')
      const builder = new LinkBuilder(ctx)

      const link = builder.action(ReadOnlyController, 'show' as never, { id: '456' })
      expect(link).toEqual({ href: '/users/456' })
    })

    it('should include method when not GET', () => {
      const ctx = createMockRouterContext('http://localhost:8787/users')
      const builder = new LinkBuilder(ctx)

      const link = builder.action(FullCrudController, 'create' as never)
      expect(link).toEqual({ href: '/users', method: 'POST' })
    })

    it('should resolve path from current controller when no class passed', () => {
      const ctx = createMockRouterContext('http://localhost:8787/users', ReadOnlyController)
      const builder = new LinkBuilder(ctx)

      const link = builder.action('show' as never, { id: '789' })
      expect(link).toEqual({ href: '/users/789' })
    })

    it('should throw when no current controller and none passed', () => {
      const ctx = createMockRouterContext('http://localhost:8787/users')
      const builder = new LinkBuilder(ctx)

      expect(() => builder.action('show' as never)).toThrow('Cannot determine current controller')
    })
  })

  describe('resource()', () => {
    it('should generate CRUD links for existing methods', () => {
      const ctx = createMockRouterContext('http://localhost:8787/users', FullCrudController)
      const builder = new LinkBuilder(ctx)

      const links = builder.resource({ id: '123' })

      expect(links.collection).toEqual({ href: '/users' })
      expect(links.self).toEqual({ href: '/users/123' })
      expect(links.create).toEqual({ href: '/users', method: 'POST' })
      expect(links.update).toEqual({ href: '/users/123', method: 'PUT' })
      expect(links.delete).toEqual({ href: '/users/123', method: 'DELETE' })
    })

    it('should only include links for methods that exist', () => {
      const ctx = createMockRouterContext('http://localhost:8787/users', ReadOnlyController)
      const builder = new LinkBuilder(ctx)

      const links = builder.resource({ id: '123' })

      expect(links.collection).toBeDefined()
      expect(links.self).toBeDefined()
      expect(links.create).toBeUndefined()
      expect(links.update).toBeUndefined()
      expect(links.delete).toBeUndefined()
    })

    it('should work with explicit controller', () => {
      const ctx = createMockRouterContext('http://localhost:8787/users')
      const builder = new LinkBuilder(ctx)

      const links = builder.resource(PostsReadOnlyController, { id: '42' })
      expect(links.collection).toEqual({ href: '/posts' })
      expect(links.self).toEqual({ href: '/posts/42' })
    })
  })

  describe('collection()', () => {
    it('should generate pagination links', () => {
      const ctx = createMockRouterContext('http://localhost:8787/users', ReadOnlyController)
      const builder = new LinkBuilder(ctx)

      const links = builder.collection({ page: 2, limit: 20, total: 100, totalPages: 5 })

      expect(links.self).toEqual({ href: '/users?page=2&limit=20' })
      expect(links.first).toEqual({ href: '/users?page=1&limit=20' })
      expect(links.last).toEqual({ href: '/users?page=5&limit=20' })
      expect(links.next).toEqual({ href: '/users?page=3&limit=20' })
      expect(links.prev).toEqual({ href: '/users?page=1&limit=20' })
    })

    it('should not include next when on last page', () => {
      const ctx = createMockRouterContext('http://localhost:8787/users', ReadOnlyController)
      const builder = new LinkBuilder(ctx)

      const links = builder.collection({ page: 3, limit: 10, total: 30, totalPages: 3 })

      expect(links.next).toBeUndefined()
      expect(links.prev).toEqual({ href: '/users?page=2&limit=10' })
    })

    it('should not include prev when on first page', () => {
      const ctx = createMockRouterContext('http://localhost:8787/users', ReadOnlyController)
      const builder = new LinkBuilder(ctx)

      const links = builder.collection({ page: 1, limit: 20, total: 50, totalPages: 3 })

      expect(links.prev).toBeUndefined()
      expect(links.next).toEqual({ href: '/users?page=2&limit=20' })
    })

    it('should include extra query params', () => {
      const ctx = createMockRouterContext('http://localhost:8787/users', ReadOnlyController)
      const builder = new LinkBuilder(ctx)

      const links = builder.collection({ page: 1, limit: 10, total: 20, totalPages: 2 }, { status: 'active' })

      expect(links.self?.href).toContain('status=active')
      expect(links.self?.href).toContain('page=1')
    })

    it('should work with explicit controller', () => {
      const ctx = createMockRouterContext('http://localhost:8787/users')
      const builder = new LinkBuilder(ctx)

      const links = builder.collection(PostsIndexController, { page: 1, limit: 10, total: 5, totalPages: 1 })

      expect(links.self).toEqual({ href: '/posts?page=1&limit=10' })
    })
  })

  describe('link()', () => {
    it('should build link from explicit path', () => {
      const ctx = createMockRouterContext('http://localhost:8787/users')
      const builder = new LinkBuilder(ctx)

      expect(builder.link('/users/:id', { id: '123' })).toEqual({ href: '/users/123' })
    })

    it('should include method when not GET', () => {
      const ctx = createMockRouterContext('http://localhost:8787/users')
      const builder = new LinkBuilder(ctx)

      expect(builder.link('/users/:id', { id: '123' }, 'DELETE')).toEqual({ href: '/users/123', method: 'DELETE' })
    })

    it('should omit method when GET', () => {
      const ctx = createMockRouterContext('http://localhost:8787/users')
      const builder = new LinkBuilder(ctx)

      expect(builder.link('/users', undefined, 'GET')).toEqual({ href: '/users' })
    })
  })

  describe('versioning', () => {
    it('should apply version prefix to controller paths', () => {
      const ctx = createMockRouterContext('http://localhost:8787/v1/users')
      const builder = new LinkBuilder(ctx, { prefix: 'v' })

      const link = builder.action(VersionedController, 'show' as never, { id: '123' })
      expect(link).toEqual({ href: '/v1/users/123' })
    })

    it('should apply default version when controller has no explicit version', () => {
      const ctx = createMockRouterContext('http://localhost:8787/v2/users')
      const builder = new LinkBuilder(ctx, { defaultVersion: '2' })

      const link = builder.action(ReadOnlyController, 'show' as never, { id: '123' })
      expect(link).toEqual({ href: '/v2/users/123' })
    })

    it('should use first version for multi-version controllers', () => {
      const ctx = createMockRouterContext('http://localhost:8787/v1/users')
      const builder = new LinkBuilder(ctx, { prefix: 'v' })

      const link = builder.action(MultiVersionController, 'show' as never, { id: '123' })
      expect(link).toEqual({ href: '/v1/users/123' })
    })

    it('should not apply version prefix when no versioning options', () => {
      const ctx = createMockRouterContext('http://localhost:8787/users')
      const builder = new LinkBuilder(ctx)

      const link = builder.action(VersionedController, 'show' as never, { id: '123' })
      expect(link).toEqual({ href: '/users/123' })
    })
  })
})
