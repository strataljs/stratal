import { describe, expect, it } from 'vitest'
import type { Container } from '../../di/container'
import type { I18nModuleOptions } from '../../i18n/i18n.options'
import { I18N_TOKENS } from '../../i18n/i18n.tokens'
import { VERSION_NEUTRAL } from '../constants'
import type { HonoApp } from '../hono-app'
import { RouteRegistry, type RouteRegistrationInput } from '../route-registry'
import { LocalePathService } from '../services/locale-path.service'
import type { VersioningService } from '../services/versioning.service'
import type { VersioningOptions } from '../types'

/**
 * Create a mock VersioningService that mirrors the real service's resolution logic.
 */
const createMockVersioningService = (options: VersioningOptions | null = null): VersioningService => {
  return {
    enabled: options !== null,
    resolve(basePath: string, version?: string | string[] | typeof VERSION_NEUTRAL): string[] {
      if (!options) return [basePath]
      if (version === VERSION_NEUTRAL) return [basePath]

      const prefix = options.prefix ?? 'v'

      if (version !== undefined) {
        const versions = Array.isArray(version) ? version : [version]
        return versions.map(v => `/${prefix}${v}${basePath}`)
      }

      if (options.defaultVersion !== undefined) {
        const defaults = Array.isArray(options.defaultVersion)
          ? options.defaultVersion
          : [options.defaultVersion]
        return defaults.map(v => `/${prefix}${v}${basePath}`)
      }

      return [basePath]
    },
  } as unknown as VersioningService
}

/**
 * Build a real LocalePathService from i18n options, backed by a stub container
 * and a no-op HonoApp (the constructor only calls `honoApp.use(...)` to install
 * detection middleware). Using the real service — rather than re-deriving its
 * `resolve()` output here — keeps these registry tests honest: locale-variant
 * path generation (including the constraint grouping) is exercised, not copied.
 * `undefined` options yield a detection-disabled service (no locale variants).
 */
const createLocalePathService = (i18nOptions?: I18nModuleOptions): LocalePathService => {
  const container = {
    isRegistered: (token: unknown) => token === I18N_TOKENS.Options && i18nOptions !== undefined,
    resolve: (token: unknown) => (token === I18N_TOKENS.Options ? i18nOptions : undefined),
  } as unknown as Container
  const honoApp = { use: () => honoApp } as unknown as HonoApp
  return new LocalePathService(container, honoApp)
}

const createInput = (overrides: Partial<RouteRegistrationInput> = {}): RouteRegistrationInput => ({
  method: 'get',
  basePath: '/users',
  controller: 'UsersController',
  action: 'index',
  hidden: false,
  middleware: [],
  ...overrides,
})

/** Extract just paths from registered routes */
const paths = (registry: RouteRegistry, input: RouteRegistrationInput): string[] => {
  const routes = registry.register(input)
  return routes.map(r => r.path)
}

describe('Versioning', () => {
  describe('VersioningService via RouteRegistry', () => {
    describe('versioning disabled (no config)', () => {
      it('should return base path when no versioning config', () => {
        const registry = new RouteRegistry(createMockVersioningService(null), createLocalePathService())
        expect(paths(registry, createInput({ basePath: '/users' }))).toEqual(['/users'])
      })

      it('should ignore version in input when versioning disabled', () => {
        const registry = new RouteRegistry(createMockVersioningService(null), createLocalePathService())
        expect(paths(registry, createInput({ basePath: '/users', version: '1' }))).toEqual(['/users'])
      })
    })

    describe('explicit version on input', () => {
      it('should prefix with version using default prefix "v"', () => {
        const registry = new RouteRegistry(createMockVersioningService({}), createLocalePathService())
        expect(paths(registry, createInput({ basePath: '/users', version: '1' }))).toEqual(['/v1/users'])
      })

      it('should support multi-version input', () => {
        const registry = new RouteRegistry(createMockVersioningService({}), createLocalePathService())
        expect(paths(registry, createInput({ basePath: '/users', version: ['1', '2'] }))).toEqual(['/v1/users', '/v2/users'])
      })

      it('should use custom prefix', () => {
        const registry = new RouteRegistry(createMockVersioningService({ prefix: 'api/v' }), createLocalePathService())
        expect(paths(registry, createInput({ basePath: '/users', version: '1' }))).toEqual(['/api/v1/users'])
      })
    })

    describe('VERSION_NEUTRAL', () => {
      it('should return base path without prefix', () => {
        const registry = new RouteRegistry(createMockVersioningService({}), createLocalePathService())
        expect(paths(registry, createInput({ basePath: '/health', version: VERSION_NEUTRAL }))).toEqual(['/health'])
      })

      it('should ignore defaultVersion when VERSION_NEUTRAL', () => {
        const registry = new RouteRegistry(createMockVersioningService({ defaultVersion: '1' }), createLocalePathService())
        expect(paths(registry, createInput({ basePath: '/health', version: VERSION_NEUTRAL }))).toEqual(['/health'])
      })
    })

    describe('defaultVersion', () => {
      it('should apply defaultVersion to inputs without explicit version', () => {
        const registry = new RouteRegistry(createMockVersioningService({ defaultVersion: '1' }), createLocalePathService())
        expect(paths(registry, createInput({ basePath: '/status' }))).toEqual(['/v1/status'])
      })

      it('should apply array defaultVersion', () => {
        const registry = new RouteRegistry(createMockVersioningService({ defaultVersion: ['1', '2'] }), createLocalePathService())
        expect(paths(registry, createInput({ basePath: '/status' }))).toEqual(['/v1/status', '/v2/status'])
      })

      it('should not apply defaultVersion when input has explicit version', () => {
        const registry = new RouteRegistry(createMockVersioningService({ defaultVersion: '1' }), createLocalePathService())
        expect(paths(registry, createInput({ basePath: '/users', version: '2' }))).toEqual(['/v2/users'])
      })

      it('should not apply defaultVersion to VERSION_NEUTRAL inputs', () => {
        const registry = new RouteRegistry(createMockVersioningService({ defaultVersion: '1' }), createLocalePathService())
        expect(paths(registry, createInput({ basePath: '/health', version: VERSION_NEUTRAL }))).toEqual(['/health'])
      })
    })

    describe('no version and no defaultVersion', () => {
      it('should return base path unchanged', () => {
        const registry = new RouteRegistry(createMockVersioningService({}), createLocalePathService())
        expect(paths(registry, createInput({ basePath: '/status' }))).toEqual(['/status'])
      })
    })

    describe('custom prefix', () => {
      it('should use custom prefix for versioned paths', () => {
        const registry = new RouteRegistry(createMockVersioningService({ prefix: 'api/v' }), createLocalePathService())
        expect(paths(registry, createInput({ basePath: '/users', version: '1' }))).toEqual(['/api/v1/users'])
      })

      it('should use custom prefix with defaultVersion', () => {
        const registry = new RouteRegistry(createMockVersioningService({ prefix: 'api/v', defaultVersion: '2' }), createLocalePathService())
        expect(paths(registry, createInput({ basePath: '/users' }))).toEqual(['/api/v2/users'])
      })
    })
  })

  describe('LocalePathService via RouteRegistry', () => {
    describe('all locales prefixed (prefixDefaultLocale: true)', () => {
      const allPrefixed: I18nModuleOptions = { defaultLocale: 'en', locales: ['en', 'fr'], detection: { strategy: 'path', prefixDefaultLocale: true } }

      it('should prefix all paths with /:locale', () => {
        const registry = new RouteRegistry(createMockVersioningService(null), createLocalePathService(allPrefixed))
        expect(paths(registry, createInput({ basePath: '/users' }))).toEqual(['/:locale{(?:en|fr)}/users'])
      })

      it('should mark locale-prefixed paths as locale variants', () => {
        const registry = new RouteRegistry(createMockVersioningService(null), createLocalePathService(allPrefixed))
        const routes = registry.register(createInput({ basePath: '/users' }))
        expect(routes).toHaveLength(1)
        expect(routes[0].isLocaleVariant).toBe(true)
      })

      it('should combine with versioning', () => {
        const registry = new RouteRegistry(createMockVersioningService({ defaultVersion: '1' }), createLocalePathService(allPrefixed))
        expect(paths(registry, createInput({ basePath: '/users' }))).toEqual(['/:locale{(?:en|fr)}/v1/users'])
      })
    })

    describe('default locale unprefixed (prefixDefaultLocale: false)', () => {
      const unprefixed: I18nModuleOptions = { defaultLocale: 'en', locales: ['en', 'fr'], detection: { strategy: 'path' } }

      it('should return both unprefixed and prefixed paths', () => {
        const registry = new RouteRegistry(createMockVersioningService(null), createLocalePathService(unprefixed))
        expect(paths(registry, createInput({ basePath: '/users' }))).toEqual(['/users', '/:locale{(?:fr)}/users'])
      })

      it('should set isLocaleVariant correctly for each path', () => {
        const registry = new RouteRegistry(createMockVersioningService(null), createLocalePathService(unprefixed))
        const routes = registry.register(createInput({ basePath: '/users' }))
        expect(routes).toHaveLength(2)
        expect(routes[0].isLocaleVariant).toBeUndefined() // primary path — not a locale variant
        expect(routes[1].isLocaleVariant).toBe(true)
      })

      it('should combine with versioning', () => {
        const registry = new RouteRegistry(createMockVersioningService({ defaultVersion: '1' }), createLocalePathService(unprefixed))
        expect(paths(registry, createInput({ basePath: '/users' }))).toEqual(['/v1/users', '/:locale{(?:fr)}/v1/users'])
      })

      it('should combine with multi-version', () => {
        const registry = new RouteRegistry(createMockVersioningService({}), createLocalePathService(unprefixed))
        expect(paths(registry, createInput({ basePath: '/users', version: ['1', '2'] }))).toEqual([
          '/v1/users', '/:locale{(?:fr)}/v1/users',
          '/v2/users', '/:locale{(?:fr)}/v2/users',
        ])
      })
    })

    describe('single locale (only default)', () => {
      const singleLocale: I18nModuleOptions = { defaultLocale: 'en', locales: ['en'], detection: { strategy: 'path' } }

      it('should return only the unprefixed path (no /:locale route)', () => {
        const registry = new RouteRegistry(createMockVersioningService(null), createLocalePathService(singleLocale))
        const routes = registry.register(createInput({ basePath: '/users' }))
        expect(routes).toHaveLength(1)
        expect(routes[0].path).toBe('/users')
        expect(routes[0].isLocaleVariant).toBeUndefined()
      })
    })

    describe('no locale config', () => {
      it('should return paths without locale prefix', () => {
        const registry = new RouteRegistry(createMockVersioningService(null), createLocalePathService())
        const routes = registry.register(createInput({ basePath: '/users' }))
        expect(routes).toHaveLength(1)
        expect(routes[0].path).toBe('/users')
        expect(routes[0].isLocaleVariant).toBeUndefined()
      })
    })
  })
})
