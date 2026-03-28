import { describe, expect, it } from 'vitest'
import { getPathSpecificityScore, sortRoutesBySpecificity, toOpenAPIPath } from '../utils/path'

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

    it('should not convert regex wildcards', () => {
      expect(toOpenAPIPath('/api/:path{.+}')).toBe('/api/{path}{.+}')
    })
  })

  describe('getPathSpecificityScore', () => {
    it('should score static paths as 0', () => {
      expect(getPathSpecificityScore('/users')).toBe(0)
      expect(getPathSpecificityScore('/api/v1/health')).toBe(0)
    })

    it('should score :param segments as 10 each', () => {
      expect(getPathSpecificityScore('/users/:id')).toBe(10)
      expect(getPathSpecificityScore('/:companyId/users/:id')).toBe(20)
    })

    it('should score OpenAPI {param} segments as 10 each', () => {
      expect(getPathSpecificityScore('/{locale}/users')).toBe(1000)
    })

    it('should score wildcards as 100', () => {
      expect(getPathSpecificityScore('/api/:path{.+}')).toBe(100)
    })

    it('should add 1000 for locale-prefixed paths', () => {
      expect(getPathSpecificityScore('/{locale}/users')).toBe(1000)
      expect(getPathSpecificityScore('/{locale}/users/:id')).toBe(1010)
    })

    it('should not add locale penalty for non-first-segment {param}', () => {
      expect(getPathSpecificityScore('/users/{locale}')).toBe(10)
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

    it('should sort primary paths before locale variants', () => {
      const routes = [
        { path: '/{locale}/users/:id' },
        { path: '/users/:id' },
      ]
      const sorted = sortRoutesBySpecificity(routes)
      expect(sorted[0].path).toBe('/users/:id')
      expect(sorted[1].path).toBe('/{locale}/users/:id')
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
        { path: '/{locale}/:companyId/settings' },
        { path: '/:companyId/settings' },
        { path: '/health' },
        { path: '/{locale}/health' },
      ]
      const sorted = sortRoutesBySpecificity(routes)
      expect(sorted.map(r => r.path)).toEqual([
        '/health',
        '/:companyId/settings',
        '/{locale}/health',
        '/{locale}/:companyId/settings',
      ])
    })

    it('should not mutate the original array', () => {
      const routes = [{ path: '/b' }, { path: '/a' }]
      const sorted = sortRoutesBySpecificity(routes)
      expect(sorted).not.toBe(routes)
    })
  })
})
