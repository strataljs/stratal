import { describe, expect, it } from 'vitest'
import { VERSION_NEUTRAL } from '../constants'
import { RouteRegistry, type RouteRegistrationInput } from '../route-registry'
import type { VersioningService } from '../services/versioning.service'
import type { LocalePathService, ResolvedPath } from '../services/locale-path.service'
import type { LocalePathConfig, VersioningOptions } from '../types'

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
 * Create a mock LocalePathService that mirrors the real service's resolution logic.
 */
const createMockLocalePathService = (config: LocalePathConfig | null = null): LocalePathService => {
  return {
    enabled: config !== null,
    localePathConfig: config,
    resolve(path: string): ResolvedPath[] {
      if (!config) return [{ path, isLocaleVariant: false }]

      // All locales prefixed (defaultLocale is null)
      if (config.defaultLocale === null) {
        return [{ path: `/{locale}${path}`, isLocaleVariant: true }]
      }

      // Default locale unprefixed
      const result: ResolvedPath[] = [{ path, isLocaleVariant: false }]
      if (config.prefixedLocales.length > 0) {
        result.push({ path: `/{locale}${path}`, isLocaleVariant: true })
      }
      return result
    },
  } as unknown as LocalePathService
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
        const registry = new RouteRegistry(createMockVersioningService(null), createMockLocalePathService())
        expect(paths(registry, createInput({ basePath: '/users' }))).toEqual(['/users'])
      })

      it('should ignore version in input when versioning disabled', () => {
        const registry = new RouteRegistry(createMockVersioningService(null), createMockLocalePathService())
        expect(paths(registry, createInput({ basePath: '/users', version: '1' }))).toEqual(['/users'])
      })
    })

    describe('explicit version on input', () => {
      it('should prefix with version using default prefix "v"', () => {
        const registry = new RouteRegistry(createMockVersioningService({}), createMockLocalePathService())
        expect(paths(registry, createInput({ basePath: '/users', version: '1' }))).toEqual(['/v1/users'])
      })

      it('should support multi-version input', () => {
        const registry = new RouteRegistry(createMockVersioningService({}), createMockLocalePathService())
        expect(paths(registry, createInput({ basePath: '/users', version: ['1', '2'] }))).toEqual(['/v1/users', '/v2/users'])
      })

      it('should use custom prefix', () => {
        const registry = new RouteRegistry(createMockVersioningService({ prefix: 'api/v' }), createMockLocalePathService())
        expect(paths(registry, createInput({ basePath: '/users', version: '1' }))).toEqual(['/api/v1/users'])
      })
    })

    describe('VERSION_NEUTRAL', () => {
      it('should return base path without prefix', () => {
        const registry = new RouteRegistry(createMockVersioningService({}), createMockLocalePathService())
        expect(paths(registry, createInput({ basePath: '/health', version: VERSION_NEUTRAL }))).toEqual(['/health'])
      })

      it('should ignore defaultVersion when VERSION_NEUTRAL', () => {
        const registry = new RouteRegistry(createMockVersioningService({ defaultVersion: '1' }), createMockLocalePathService())
        expect(paths(registry, createInput({ basePath: '/health', version: VERSION_NEUTRAL }))).toEqual(['/health'])
      })
    })

    describe('defaultVersion', () => {
      it('should apply defaultVersion to inputs without explicit version', () => {
        const registry = new RouteRegistry(createMockVersioningService({ defaultVersion: '1' }), createMockLocalePathService())
        expect(paths(registry, createInput({ basePath: '/status' }))).toEqual(['/v1/status'])
      })

      it('should apply array defaultVersion', () => {
        const registry = new RouteRegistry(createMockVersioningService({ defaultVersion: ['1', '2'] }), createMockLocalePathService())
        expect(paths(registry, createInput({ basePath: '/status' }))).toEqual(['/v1/status', '/v2/status'])
      })

      it('should not apply defaultVersion when input has explicit version', () => {
        const registry = new RouteRegistry(createMockVersioningService({ defaultVersion: '1' }), createMockLocalePathService())
        expect(paths(registry, createInput({ basePath: '/users', version: '2' }))).toEqual(['/v2/users'])
      })

      it('should not apply defaultVersion to VERSION_NEUTRAL inputs', () => {
        const registry = new RouteRegistry(createMockVersioningService({ defaultVersion: '1' }), createMockLocalePathService())
        expect(paths(registry, createInput({ basePath: '/health', version: VERSION_NEUTRAL }))).toEqual(['/health'])
      })
    })

    describe('no version and no defaultVersion', () => {
      it('should return base path unchanged', () => {
        const registry = new RouteRegistry(createMockVersioningService({}), createMockLocalePathService())
        expect(paths(registry, createInput({ basePath: '/status' }))).toEqual(['/status'])
      })
    })

    describe('custom prefix', () => {
      it('should use custom prefix for versioned paths', () => {
        const registry = new RouteRegistry(createMockVersioningService({ prefix: 'api/v' }), createMockLocalePathService())
        expect(paths(registry, createInput({ basePath: '/users', version: '1' }))).toEqual(['/api/v1/users'])
      })

      it('should use custom prefix with defaultVersion', () => {
        const registry = new RouteRegistry(createMockVersioningService({ prefix: 'api/v', defaultVersion: '2' }), createMockLocalePathService())
        expect(paths(registry, createInput({ basePath: '/users' }))).toEqual(['/api/v2/users'])
      })
    })
  })

  describe('LocalePathService via RouteRegistry', () => {
    describe('all locales prefixed (prefixDefaultLocale: true)', () => {
      const allPrefixed: LocalePathConfig = { allLocales: ['en', 'fr'], prefixedLocales: ['en', 'fr'], defaultLocale: null }

      it('should prefix all paths with /{locale}', () => {
        const registry = new RouteRegistry(createMockVersioningService(null), createMockLocalePathService(allPrefixed))
        expect(paths(registry, createInput({ basePath: '/users' }))).toEqual(['/{locale}/users'])
      })

      it('should mark locale-prefixed paths as locale variants', () => {
        const registry = new RouteRegistry(createMockVersioningService(null), createMockLocalePathService(allPrefixed))
        const routes = registry.register(createInput({ basePath: '/users' }))
        expect(routes).toHaveLength(1)
        expect(routes[0].isLocaleVariant).toBe(true)
      })

      it('should combine with versioning', () => {
        const registry = new RouteRegistry(createMockVersioningService({ defaultVersion: '1' }), createMockLocalePathService(allPrefixed))
        expect(paths(registry, createInput({ basePath: '/users' }))).toEqual(['/{locale}/v1/users'])
      })
    })

    describe('default locale unprefixed (prefixDefaultLocale: false)', () => {
      const unprefixed: LocalePathConfig = { allLocales: ['en', 'fr'], prefixedLocales: ['fr'], defaultLocale: 'en' }

      it('should return both unprefixed and prefixed paths', () => {
        const registry = new RouteRegistry(createMockVersioningService(null), createMockLocalePathService(unprefixed))
        expect(paths(registry, createInput({ basePath: '/users' }))).toEqual(['/users', '/{locale}/users'])
      })

      it('should set isLocaleVariant correctly for each path', () => {
        const registry = new RouteRegistry(createMockVersioningService(null), createMockLocalePathService(unprefixed))
        const routes = registry.register(createInput({ basePath: '/users' }))
        expect(routes).toHaveLength(2)
        expect(routes[0].isLocaleVariant).toBeUndefined() // primary path — not a locale variant
        expect(routes[1].isLocaleVariant).toBe(true)
      })

      it('should combine with versioning', () => {
        const registry = new RouteRegistry(createMockVersioningService({ defaultVersion: '1' }), createMockLocalePathService(unprefixed))
        expect(paths(registry, createInput({ basePath: '/users' }))).toEqual(['/v1/users', '/{locale}/v1/users'])
      })

      it('should combine with multi-version', () => {
        const registry = new RouteRegistry(createMockVersioningService({}), createMockLocalePathService(unprefixed))
        expect(paths(registry, createInput({ basePath: '/users', version: ['1', '2'] }))).toEqual([
          '/v1/users', '/{locale}/v1/users',
          '/v2/users', '/{locale}/v2/users',
        ])
      })
    })

    describe('single locale (only default)', () => {
      const singleLocale: LocalePathConfig = { allLocales: ['en'], prefixedLocales: [], defaultLocale: 'en' }

      it('should return only the unprefixed path (no /{locale} route)', () => {
        const registry = new RouteRegistry(createMockVersioningService(null), createMockLocalePathService(singleLocale))
        const routes = registry.register(createInput({ basePath: '/users' }))
        expect(routes).toHaveLength(1)
        expect(routes[0].path).toBe('/users')
        expect(routes[0].isLocaleVariant).toBeUndefined()
      })
    })

    describe('no locale config', () => {
      it('should return paths without locale prefix', () => {
        const registry = new RouteRegistry(createMockVersioningService(null), createMockLocalePathService(null))
        const routes = registry.register(createInput({ basePath: '/users' }))
        expect(routes).toHaveLength(1)
        expect(routes[0].path).toBe('/users')
        expect(routes[0].isLocaleVariant).toBeUndefined()
      })
    })
  })
})
