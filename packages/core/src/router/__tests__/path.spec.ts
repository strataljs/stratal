import { describe, expect, it } from 'vitest'
import { getPathSpecificityScore, sortRoutesBySpecificity, toOpenAPIPath, toRoutingOpenAPIPath } from '../utils/path'

describe('Path Utilities', () => {
  describe('toOpenAPIPath', () => {
    it('should convert :param to {param}', () => {
      expect(toOpenAPIPath('/users/:id')).toBe('/users/{id}')
    })

    it('should convert multiple params', () => {
      expect(toOpenAPIPath('/:companyId/users/:userId')).toBe('/{companyId}/users/{userId}')
    })

    it('should leave static paths unchanged', () => {
      expect(toOpenAPIPath('/users')).toBe('/users')
      expect(toOpenAPIPath('/api/v1/health')).toBe('/api/v1/health')
    })

    it('should handle mixed static and param segments', () => {
      expect(toOpenAPIPath('/users/:id/posts')).toBe('/users/{id}/posts')
    })

    it('should handle underscored param names', () => {
      expect(toOpenAPIPath('/users/:user_id')).toBe('/users/{user_id}')
    })

    it('should strip regex constraints from params', () => {
      expect(toOpenAPIPath('/api/:path{.+}')).toBe('/api/{path}')
    })

    it('should strip locale regex constraints', () => {
      expect(toOpenAPIPath('/:locale{en|de|fr}/users')).toBe('/{locale}/users')
    })
  })

  describe('toRoutingOpenAPIPath', () => {
    it('should convert :param to {param}', () => {
      expect(toRoutingOpenAPIPath('/users/:id')).toBe('/users/{id}')
    })

    it('should preserve regex constraints', () => {
      expect(toRoutingOpenAPIPath('/:locale{sw}/users/:id')).toBe('/{locale}{sw}/users/{id}')
    })

    it('should preserve multi-value constraints', () => {
      expect(toRoutingOpenAPIPath('/:locale{en|de|fr}/users')).toBe('/{locale}{en|de|fr}/users')
    })

    it('should handle mixed constrained and unconstrained params', () => {
      expect(toRoutingOpenAPIPath('/:locale{sw}/:tenantId/users')).toBe('/{locale}{sw}/{tenantId}/users')
    })

    it('should handle paths without constraints same as toOpenAPIPath', () => {
      expect(toRoutingOpenAPIPath('/users/:id/posts')).toBe('/users/{id}/posts')
    })
  })

  describe('getPathSpecificityScore', () => {
    it('should score static paths as 0', () => {
      expect(getPathSpecificityScore('/users')).toBe(0)
      expect(getPathSpecificityScore('/api/v1/health')).toBe(0)
    })

    it('should score root path as 0', () => {
      expect(getPathSpecificityScore('/')).toBe(0)
    })

    it('should score :param segments as 10 each', () => {
      expect(getPathSpecificityScore('/users/:id')).toBe(10)
      expect(getPathSpecificityScore('/:companyId/users/:id')).toBe(20)
    })

    it('should score wildcards as 100', () => {
      expect(getPathSpecificityScore('/api/:path{.+}')).toBe(100)
    })

    it('should score constrained params as 5', () => {
      expect(getPathSpecificityScore('/:locale{en|de|fr}/users')).toBe(5)
      expect(getPathSpecificityScore('/:locale{en|de|fr}/users/:id')).toBe(15)
    })

    it('should score constrained params lower than unconstrained params', () => {
      // Constrained locale route should register before unconstrained tenantId route
      expect(getPathSpecificityScore('/:locale{sw}')).toBeLessThan(
        getPathSpecificityScore('/:tenantId'),
      )
    })
  })

  describe('sortRoutesBySpecificity', () => {
    it('should sort static before parameterized', () => {
      const routes = [
        { path: '/users/:id' },
        { path: '/users/create' },
      ]
      const sorted = sortRoutesBySpecificity(routes)
      expect(sorted[0].path).toBe('/users/create')
      expect(sorted[1].path).toBe('/users/:id')
    })

    it('should sort parameterized before wildcards', () => {
      const routes = [
        { path: '/api/:path{.+}' },
        { path: '/api/:id' },
      ]
      const sorted = sortRoutesBySpecificity(routes)
      expect(sorted[0].path).toBe('/api/:id')
      expect(sorted[1].path).toBe('/api/:path{.+}')
    })

    it('should sort locale variants before their primary', () => {
      const routes = [
        { path: '/users/:id', isLocaleVariant: false },
        { path: '/:locale{en|fr}/users/:id', isLocaleVariant: true },
      ]
      const sorted = sortRoutesBySpecificity(routes)
      expect(sorted[0].path).toBe('/:locale{en|fr}/users/:id')
      expect(sorted[1].path).toBe('/users/:id')
    })

    it('should sort the locale variant of a catch-all before the primary catch-all', () => {
      // Regression: with `/:slug{.+}` registered first, Hono let the catch-all
      // gobble locale-prefixed URLs (e.g. `/sw/applications/123` was matched
      // as `slug='sw/applications/123'` instead of locale='sw' + slug='applications/123').
      const routes = [
        { path: '/:slug{.+}', isLocaleVariant: false },
        { path: '/:locale{sw}/:slug{.+}', isLocaleVariant: true },
      ]
      const sorted = sortRoutesBySpecificity(routes)
      expect(sorted.map(r => r.path)).toEqual([
        '/:locale{sw}/:slug{.+}',
        '/:slug{.+}',
      ])
    })

    it('should use segment count as tie-breaker (more segments first)', () => {
      const routes = [
        { path: '/api' },
        { path: '/api/v1/users' },
      ]
      const sorted = sortRoutesBySpecificity(routes)
      expect(sorted[0].path).toBe('/api/v1/users')
      expect(sorted[1].path).toBe('/api')
    })

    it('should handle complex mixed routes', () => {
      const routes = [
        { path: '/:locale{en|fr}/:companyId/settings', isLocaleVariant: true },
        { path: '/:companyId/settings', isLocaleVariant: false },
        { path: '/health', isLocaleVariant: false },
        { path: '/:locale{en|fr}/health', isLocaleVariant: true },
      ]
      const sorted = sortRoutesBySpecificity(routes)
      // Each variant sorts immediately ahead of its primary (its extra :locale
      // segment is the tie-breaker once their scores are equalised), and the
      // pairs themselves remain in static-before-parameterised order.
      expect(sorted.map(r => r.path)).toEqual([
        '/:locale{en|fr}/health',
        '/health',
        '/:locale{en|fr}/:companyId/settings',
        '/:companyId/settings',
      ])
    })

    it('should not mutate the original array', () => {
      const routes = [{ path: '/b' }, { path: '/a' }]
      const sorted = sortRoutesBySpecificity(routes)
      expect(sorted).not.toBe(routes)
    })
  })
})
