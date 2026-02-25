import { describe, expect, it } from 'vitest'
import { MiddlewareConfigurationService } from '../middleware-configuration.service'
import { createMock } from '@stratal/testing/mocks'
import type { LoggerService } from '../../logger/services/logger.service'

interface MiddlewareConfigurationServicePrivate {
  matchesPath(requestPath: string, pattern: string): boolean
  matchesRoute(requestPath: string, requestMethod: string, route: { path: string; method?: string }): boolean
  isExcluded(requestPath: string, requestMethod: string, excludes: { path: string; method?: string }[]): boolean
}

describe('MiddlewareConfigurationService', () => {
  const mockLogger = createMock<LoggerService>()
  const service = new MiddlewareConfigurationService(mockLogger as unknown as LoggerService)

  // Access private matchesPath via type casting for unit testing
  const matchesPath = (requestPath: string, pattern: string): boolean => {
    return (service as unknown as MiddlewareConfigurationServicePrivate).matchesPath(requestPath, pattern)
  }

  describe('matchesPath()', () => {
    it('should return true for exact match', () => {
      expect(matchesPath('/api/users', '/api/users')).toBe(true)
    })

    it('should return false for different path', () => {
      expect(matchesPath('/api/users', '/api/posts')).toBe(false)
    })

    it('should return true for wildcard match', () => {
      expect(matchesPath('/api/users/123', '/api/*')).toBe(true)
    })

    it('should return false for wildcard no match', () => {
      expect(matchesPath('/other', '/api/*')).toBe(false)
    })

    it('should return true for global wildcard', () => {
      expect(matchesPath('/any/path', '*')).toBe(true)
    })

    it('should return true for path parameter match', () => {
      expect(matchesPath('/api/users/123', '/api/users/:id')).toBe(true)
    })

    it('should match wildcard prefix exactly', () => {
      expect(matchesPath('/api', '/api/*')).toBe(true)
    })

    it('should not match partial prefixes', () => {
      expect(matchesPath('/api-v2/users', '/api/*')).toBe(false)
    })
  })

  describe('matchesRoute() exclusion behavior', () => {
    const matchesRoute = (requestPath: string, requestMethod: string, route: { path: string; method?: string }) => {
      return (service as unknown as MiddlewareConfigurationServicePrivate).matchesRoute(requestPath, requestMethod, route)
    }

    it('should match when path matches and no method specified', () => {
      expect(matchesRoute('/api/users', 'get', { path: '/api/users' })).toBe(true)
    })

    it('should match when both path and method match', () => {
      expect(matchesRoute('/api/users', 'get', { path: '/api/users', method: 'get' })).toBe(true)
    })

    it('should not match when method does not match', () => {
      expect(matchesRoute('/api/users', 'post', { path: '/api/users', method: 'get' })).toBe(false)
    })

    it('should not match when path does not match', () => {
      expect(matchesRoute('/api/posts', 'get', { path: '/api/users', method: 'get' })).toBe(false)
    })
  })

  describe('isExcluded()', () => {
    const isExcluded = (requestPath: string, requestMethod: string, excludes: { path: string; method?: string }[]) => {
      return (service as unknown as MiddlewareConfigurationServicePrivate).isExcluded(requestPath, requestMethod, excludes)
    }

    it('should return true when path matches an exclusion', () => {
      expect(isExcluded('/health', 'get', [{ path: '/health' }])).toBe(true)
    })

    it('should return false when no exclusion matches', () => {
      expect(isExcluded('/api/users', 'get', [{ path: '/health' }])).toBe(false)
    })

    it('should check method in exclusion', () => {
      expect(isExcluded('/api', 'get', [{ path: '/api', method: 'get' }])).toBe(true)
      expect(isExcluded('/api', 'post', [{ path: '/api', method: 'get' }])).toBe(false)
    })
  })
})
