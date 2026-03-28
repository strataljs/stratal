import { createMock } from '@stratal/testing/mocks'
import { describe, expect, it } from 'vitest'
import type { LoggerService } from '../../logger/services/logger.service'
import { VERSION_NEUTRAL } from '../constants'
import { RouteRegistry } from '../route-registry'
import { RouteRegistrationService } from '../services/route-registration.service'
import type { ControllerOptions, LocalePathConfig, VersioningOptions } from '../types'

const mockLogger = createMock<LoggerService>()

interface RouteRegistrationServicePrivate {
  resolveVersionedPaths(basePath: string, controllerOpts?: ControllerOptions): { path: string; hideFromDocs: boolean; hasLocaleParam: boolean }[]
}

/** Extract just paths from the resolved result */
const paths = (result: { path: string; hideFromDocs: boolean; hasLocaleParam: boolean }[]) => result.map(r => r.path)

describe('Versioning', () => {
  describe('RouteRegistrationService.resolveVersionedPaths()', () => {
    const createService = (versioning: VersioningOptions | null = null, localePathConfig: LocalePathConfig | null = null) => {
      const service = new RouteRegistrationService(mockLogger as unknown as LoggerService, new RouteRegistry(), null, versioning, localePathConfig)
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

    describe('locale path config', () => {
      describe('all locales prefixed (prefixDefaultLocale: true)', () => {
        const allPrefixed: LocalePathConfig = { allLocales: ['en', 'fr'], prefixedLocales: ['en', 'fr'], defaultLocale: null }

        it('should prefix all paths with /{locale}', () => {
          const service = createService(null, allPrefixed)
          expect(paths(service.resolveVersionedPaths('/users'))).toEqual(['/{locale}/users'])
        })

        it('should mark all paths as having locale param', () => {
          const service = createService(null, allPrefixed)
          const result = service.resolveVersionedPaths('/users')
          expect(result).toEqual([
            { path: '/{locale}/users', hideFromDocs: false, hasLocaleParam: true },
          ])
        })

        it('should combine with versioning', () => {
          const service = createService({ defaultVersion: '1' }, allPrefixed)
          expect(paths(service.resolveVersionedPaths('/users'))).toEqual(['/{locale}/v1/users'])
        })
      })

      describe('default locale unprefixed (prefixDefaultLocale: false)', () => {
        const unprefixed: LocalePathConfig = { allLocales: ['en', 'fr'], prefixedLocales: ['fr'], defaultLocale: 'en' }

        it('should return both unprefixed and prefixed paths', () => {
          const service = createService(null, unprefixed)
          expect(paths(service.resolveVersionedPaths('/users'))).toEqual(['/users', '/{locale}/users'])
        })

        it('should set hasLocaleParam correctly for each path', () => {
          const service = createService(null, unprefixed)
          const result = service.resolveVersionedPaths('/users')
          expect(result).toEqual([
            { path: '/users', hideFromDocs: false, hasLocaleParam: false },
            { path: '/{locale}/users', hideFromDocs: false, hasLocaleParam: true },
          ])
        })

        it('should combine with versioning', () => {
          const service = createService({ defaultVersion: '1' }, unprefixed)
          expect(paths(service.resolveVersionedPaths('/users'))).toEqual(['/v1/users', '/{locale}/v1/users'])
        })

        it('should combine with multi-version', () => {
          const service = createService({}, unprefixed)
          const result = service.resolveVersionedPaths('/users', { version: ['1', '2'] })
          expect(paths(result)).toEqual(['/v1/users', '/{locale}/v1/users', '/v2/users', '/{locale}/v2/users'])
        })
      })

      describe('single locale (only default)', () => {
        const singleLocale: LocalePathConfig = { allLocales: ['en'], prefixedLocales: [], defaultLocale: 'en' }

        it('should return only the unprefixed path (no /{locale} route)', () => {
          const service = createService(null, singleLocale)
          const result = service.resolveVersionedPaths('/users')
          expect(result).toEqual([
            { path: '/users', hideFromDocs: false, hasLocaleParam: false },
          ])
        })
      })

      describe('no locale config', () => {
        it('should return paths without locale prefix or hasLocaleParam', () => {
          const service = createService(null, null)
          const result = service.resolveVersionedPaths('/users')
          expect(result).toEqual([
            { path: '/users', hideFromDocs: false, hasLocaleParam: false },
          ])
        })
      })
    })
  })

})
