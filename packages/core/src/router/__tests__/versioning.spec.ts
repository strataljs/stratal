import { createMock } from '@stratal/testing/mocks'
import { describe, expect, it } from 'vitest'
import type { LoggerService } from '../../logger/services/logger.service'
import { MiddlewareConfigurationService } from '../../middleware/middleware-configuration.service'
import { VERSION_NEUTRAL } from '../constants'
import { RouteRegistrationService } from '../services/route-registration.service'
import type { ControllerOptions, VersioningOptions } from '../types'

const mockLogger = createMock<LoggerService>()

interface RouteRegistrationServicePrivate {
  resolveVersionedPaths(basePath: string, controllerOpts?: ControllerOptions): { path: string; hideFromDocs: boolean }[]
}

interface MiddlewareConfigServicePrivate {
  resolveVersionedRouteInfo(routeInfo: { path: string; method?: string; version?: string | string[] }): { path: string; method?: string }[]
}

/** Extract just paths from the resolved result */
const paths = (result: { path: string; hideFromDocs: boolean }[]) => result.map(r => r.path)

describe('Versioning', () => {
  describe('RouteRegistrationService.resolveVersionedPaths()', () => {
    const createService = (versioning: VersioningOptions | null = null, localePathPrefixes: string[] | null = null) => {
      const service = new RouteRegistrationService(mockLogger as unknown as LoggerService, versioning, localePathPrefixes)
      return service as unknown as RouteRegistrationServicePrivate
    }

    describe('versioning disabled (no config)', () => {
      it('should return base path when no versioning config', () => {
        const service = createService(null)
        expect(paths(service.resolveVersionedPaths('/users'))).toEqual(['/users'])
      })

      it('should ignore version in controller options when versioning disabled', () => {
        const service = createService(null)
        expect(paths(service.resolveVersionedPaths('/users', { version: '1' }))).toEqual(['/users'])
      })
    })

    describe('explicit version on controller', () => {
      it('should prefix with version using default prefix "v"', () => {
        const service = createService({})
        expect(paths(service.resolveVersionedPaths('/users', { version: '1' }))).toEqual(['/v1/users'])
      })

      it('should support multi-version controller', () => {
        const service = createService({})
        const result = service.resolveVersionedPaths('/users', { version: ['1', '2'] })
        expect(paths(result)).toEqual(['/v1/users', '/v2/users'])
      })

      it('should use custom prefix', () => {
        const service = createService({ prefix: 'api/v' })
        expect(paths(service.resolveVersionedPaths('/users', { version: '1' }))).toEqual(['/api/v1/users'])
      })
    })

    describe('VERSION_NEUTRAL', () => {
      it('should return base path without prefix', () => {
        const service = createService({})
        expect(paths(service.resolveVersionedPaths('/health', { version: VERSION_NEUTRAL }))).toEqual(['/health'])
      })

      it('should ignore defaultVersion when VERSION_NEUTRAL', () => {
        const service = createService({ defaultVersion: '1' })
        expect(paths(service.resolveVersionedPaths('/health', { version: VERSION_NEUTRAL }))).toEqual(['/health'])
      })
    })

    describe('defaultVersion', () => {
      it('should apply defaultVersion to controllers without explicit version', () => {
        const service = createService({ defaultVersion: '1' })
        expect(paths(service.resolveVersionedPaths('/status'))).toEqual(['/v1/status'])
      })

      it('should apply array defaultVersion', () => {
        const service = createService({ defaultVersion: ['1', '2'] })
        expect(paths(service.resolveVersionedPaths('/status'))).toEqual(['/v1/status', '/v2/status'])
      })

      it('should not apply defaultVersion when controller has explicit version', () => {
        const service = createService({ defaultVersion: '1' })
        expect(paths(service.resolveVersionedPaths('/users', { version: '2' }))).toEqual(['/v2/users'])
      })

      it('should not apply defaultVersion to VERSION_NEUTRAL controllers', () => {
        const service = createService({ defaultVersion: '1' })
        expect(paths(service.resolveVersionedPaths('/health', { version: VERSION_NEUTRAL }))).toEqual(['/health'])
      })
    })

    describe('no version and no defaultVersion', () => {
      it('should return base path unchanged', () => {
        const service = createService({})
        expect(paths(service.resolveVersionedPaths('/status'))).toEqual(['/status'])
      })
    })

    describe('custom prefix', () => {
      it('should use custom prefix for versioned paths', () => {
        const service = createService({ prefix: 'api/v' })
        expect(paths(service.resolveVersionedPaths('/users', { version: '1' }))).toEqual(['/api/v1/users'])
      })

      it('should use custom prefix with defaultVersion', () => {
        const service = createService({ prefix: 'api/v', defaultVersion: '2' })
        expect(paths(service.resolveVersionedPaths('/users'))).toEqual(['/api/v2/users'])
      })
    })

    describe('locale path prefixes', () => {
      it('should replace paths with locale-prefixed paths when localePathPrefixes is set', () => {
        const service = createService(null, ['en', 'fr'])
        const result = service.resolveVersionedPaths('/users')
        expect(paths(result)).toEqual(['/:locale{en|fr}/users'])
      })

      it('should not hide locale-prefixed paths from docs', () => {
        const service = createService(null, ['en', 'fr'])
        const result = service.resolveVersionedPaths('/users')
        expect(result).toEqual([
          { path: '/:locale{en|fr}/users', hideFromDocs: false },
        ])
      })

      it('should combine with versioning', () => {
        const service = createService({ defaultVersion: '1' }, ['en', 'fr'])
        const result = service.resolveVersionedPaths('/users')
        expect(paths(result)).toEqual(['/:locale{en|fr}/v1/users'])
      })
    })
  })

  describe('MiddlewareConfigurationService.resolveVersionedRouteInfo()', () => {
    const createService = (versioning: VersioningOptions | null = null) => {
      const service = new MiddlewareConfigurationService(mockLogger as unknown as LoggerService, versioning)
      return service as unknown as MiddlewareConfigServicePrivate
    }

    it('should return RouteInfo as-is when versioning disabled', () => {
      const service = createService(null)
      const result = service.resolveVersionedRouteInfo({ path: '/users', version: '1' })
      expect(result).toEqual([{ path: '/users', version: '1' }])
    })

    it('should return RouteInfo as-is when no version specified', () => {
      const service = createService({})
      const result = service.resolveVersionedRouteInfo({ path: '/users' })
      expect(result).toEqual([{ path: '/users' }])
    })

    it('should resolve version to versioned paths', () => {
      const service = createService({})
      const result = service.resolveVersionedRouteInfo({ path: '/users', version: '1' })
      expect(result).toEqual([
        { path: '/v1/users', method: undefined },
        { path: '/v1/users/*', method: undefined },
      ])
    })

    it('should resolve multiple versions', () => {
      const service = createService({})
      const result = service.resolveVersionedRouteInfo({ path: '/users', version: ['1', '2'] })
      expect(result).toEqual([
        { path: '/v1/users', method: undefined },
        { path: '/v1/users/*', method: undefined },
        { path: '/v2/users', method: undefined },
        { path: '/v2/users/*', method: undefined },
      ])
    })

    it('should preserve HTTP method in resolved routes', () => {
      const service = createService({})
      const result = service.resolveVersionedRouteInfo({ path: '/users', version: '1', method: 'get' })
      expect(result).toEqual([
        { path: '/v1/users', method: 'get' },
        { path: '/v1/users/*', method: 'get' },
      ])
    })

    it('should use custom prefix', () => {
      const service = createService({ prefix: 'api/v' })
      const result = service.resolveVersionedRouteInfo({ path: '/users', version: '1' })
      expect(result).toEqual([
        { path: '/api/v1/users', method: undefined },
        { path: '/api/v1/users/*', method: undefined },
      ])
    })
  })
})
