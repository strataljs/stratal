import { describe, expect, it } from 'vitest'
import { LocaleUrlService } from '../services/locale-url.service'
import type { LocalePathService } from '../services/locale-path.service'
import type { LocalePathConfig } from '../types'

function createService(stub: {
  enabled?: boolean
  config?: LocalePathConfig | null
  prefixDefaultLocale?: false | true | 'redirect'
}): LocaleUrlService {
  const localePath = {
    enabled: stub.enabled ?? false,
    localePathConfig: stub.config ?? null,
    prefixDefaultLocale: stub.prefixDefaultLocale ?? false,
  } as unknown as LocalePathService
  return new LocaleUrlService(localePath)
}

describe('LocaleUrlService', () => {
  describe('pathEnabled', () => {
    it('reflects LocalePathService.enabled', () => {
      expect(createService({ enabled: true }).pathEnabled).toBe(true)
      expect(createService({ enabled: false }).pathEnabled).toBe(false)
    })
  })

  describe('shouldPrefix', () => {
    it('returns true for every locale when path config is null (no opt-in)', () => {
      const service = createService({ config: null })
      expect(service.shouldPrefix('en')).toBe(true)
      expect(service.shouldPrefix('fr')).toBe(true)
    })

    it('returns false for the default locale when prefixDefaultLocale is false', () => {
      const service = createService({
        config: { allLocales: ['en', 'fr'], prefixedLocales: ['fr'], defaultLocale: 'en' },
        prefixDefaultLocale: false,
      })
      expect(service.shouldPrefix('en')).toBe(false)
      expect(service.shouldPrefix('fr')).toBe(true)
    })

    it('returns true for the default locale when prefixDefaultLocale is true', () => {
      const service = createService({
        config: { allLocales: ['en', 'fr'], prefixedLocales: ['en', 'fr'], defaultLocale: null },
        prefixDefaultLocale: true,
      })
      expect(service.shouldPrefix('en')).toBe(true)
    })
  })

  describe('applyPrefix', () => {
    it('prefixes only non-default locales when prefixDefaultLocale is false', () => {
      const service = createService({
        config: { allLocales: ['en', 'fr'], prefixedLocales: ['fr'], defaultLocale: 'en' },
        prefixDefaultLocale: false,
      })
      expect(service.applyPrefix('/users', 'en')).toBe('/users')
      expect(service.applyPrefix('/users', 'fr')).toBe('/fr/users')
    })

    it('prefixes every locale when prefixDefaultLocale is true', () => {
      const service = createService({
        config: { allLocales: ['en', 'fr'], prefixedLocales: ['en', 'fr'], defaultLocale: null },
        prefixDefaultLocale: true,
      })
      expect(service.applyPrefix('/users', 'en')).toBe('/en/users')
      expect(service.applyPrefix('/users', 'fr')).toBe('/fr/users')
    })
  })

  describe('stripPrefix', () => {
    it('strips a known leading locale segment', () => {
      const service = createService({
        config: { allLocales: ['en', 'fr', 'de'], prefixedLocales: ['fr', 'de'], defaultLocale: 'en' },
      })
      expect(service.stripPrefix('/fr/users')).toBe('/users')
      expect(service.stripPrefix('/users')).toBe('/users')
    })

    it('returns pathname unchanged when no locale config is available', () => {
      const service = createService({ config: null })
      expect(service.stripPrefix('/fr/users')).toBe('/fr/users')
    })
  })
})
