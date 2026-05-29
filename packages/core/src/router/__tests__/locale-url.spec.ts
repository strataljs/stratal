import { describe, expect, it } from 'vitest'
import { applyLocalePrefix, shouldPrefixLocale, stripLocalePrefix } from '../locale-url'
import type { LocaleUrlConfig } from '../types'

describe('shouldPrefixLocale', () => {
  it('returns true when no config is provided', () => {
    expect(shouldPrefixLocale('en', undefined)).toBe(true)
    expect(shouldPrefixLocale('fr', undefined)).toBe(true)
  })

  it('returns true for every locale when prefixDefaultLocale is true', () => {
    const config: LocaleUrlConfig = { defaultLocale: null, prefixDefaultLocale: true }
    expect(shouldPrefixLocale('en', config)).toBe(true)
    expect(shouldPrefixLocale('fr', config)).toBe(true)
  })

  it('returns false for the default locale when prefixDefaultLocale is false', () => {
    const config: LocaleUrlConfig = { defaultLocale: 'en', prefixDefaultLocale: false }
    expect(shouldPrefixLocale('en', config)).toBe(false)
    expect(shouldPrefixLocale('fr', config)).toBe(true)
  })

  it('returns false for the default locale when prefixDefaultLocale is "redirect"', () => {
    const config: LocaleUrlConfig = { defaultLocale: 'en', prefixDefaultLocale: 'redirect' }
    expect(shouldPrefixLocale('en', config)).toBe(false)
    expect(shouldPrefixLocale('de', config)).toBe(true)
  })
})

describe('applyLocalePrefix', () => {
  const unprefixed: LocaleUrlConfig = { defaultLocale: 'en', prefixDefaultLocale: false }
  const allPrefixed: LocaleUrlConfig = { defaultLocale: null, prefixDefaultLocale: true }

  it('prefixes a non-default locale onto a pathname', () => {
    expect(applyLocalePrefix('/users', 'fr', unprefixed)).toBe('/fr/users')
  })

  it('returns pathname unchanged for the default locale when prefixDefaultLocale is false', () => {
    expect(applyLocalePrefix('/users', 'en', unprefixed)).toBe('/users')
  })

  it('prefixes the default locale when prefixDefaultLocale is true', () => {
    expect(applyLocalePrefix('/users', 'en', allPrefixed)).toBe('/en/users')
  })

  it('handles the root pathname without producing a double slash', () => {
    expect(applyLocalePrefix('/', 'fr', unprefixed)).toBe('/fr')
    expect(applyLocalePrefix('/', 'en', unprefixed)).toBe('/')
    expect(applyLocalePrefix('/', 'en', allPrefixed)).toBe('/en')
  })

  it('always prefixes when no config is provided', () => {
    expect(applyLocalePrefix('/users', 'en', undefined)).toBe('/en/users')
  })
})

describe('stripLocalePrefix', () => {
  const locales = ['en', 'fr', 'de'] as const

  it('strips a known leading locale segment', () => {
    expect(stripLocalePrefix('/fr/users', locales)).toBe('/users')
    expect(stripLocalePrefix('/en/users/123', locales)).toBe('/users/123')
  })

  it('leaves pathname unchanged when first segment is not a known locale', () => {
    expect(stripLocalePrefix('/users/fr', locales)).toBe('/users/fr')
    expect(stripLocalePrefix('/products', locales)).toBe('/products')
  })

  it('returns "/" when the path is exactly a known locale segment', () => {
    expect(stripLocalePrefix('/fr', locales)).toBe('/')
  })

  it('returns "/" for the root pathname', () => {
    expect(stripLocalePrefix('/', locales)).toBe('/')
  })

  it('returns pathname unchanged when no locales are known', () => {
    expect(stripLocalePrefix('/fr/users', [])).toBe('/fr/users')
  })
})
