import { afterEach, describe, expect, it } from 'vitest'
import { MessageRegistry } from '../services/message-registry'

describe('MessageRegistry', () => {
  afterEach(() => {
    MessageRegistry.reset()
  })

  describe('addMessages', () => {
    it('should store messages for a locale', () => {
      MessageRegistry.addMessages({
        en: { common: { hello: 'Hello' } },
      })

      const registry = new MessageRegistry()
      const merged = registry.getMergedMessages()

      expect(merged.en).toEqual({ common: { hello: 'Hello' } })
    })

    it('should ignore empty messages', () => {
      MessageRegistry.addMessages({})

      const registry = new MessageRegistry()
      expect(registry.getMergedMessages()).toEqual({})
    })

    it('should ignore non-object values', () => {
      MessageRegistry.addMessages(null as unknown as Record<string, Record<string, unknown>>)
      MessageRegistry.addMessages(undefined as unknown as Record<string, Record<string, unknown>>)

      const registry = new MessageRegistry()
      expect(registry.getMergedMessages()).toEqual({})
    })
  })

  describe('getMergedMessages', () => {
    it('should merge multiple contributions with different keys', () => {
      MessageRegistry.addMessages({
        en: { common: { hello: 'Hello' } },
      })
      MessageRegistry.addMessages({
        en: { errors: { notFound: 'Not found' } },
      })

      const registry = new MessageRegistry()
      const merged = registry.getMergedMessages()

      expect(merged.en).toEqual({
        common: { hello: 'Hello' },
        errors: { notFound: 'Not found' },
      })
    })

    it('should override at leaf level when same key is registered twice', () => {
      MessageRegistry.addMessages({
        en: { errors: { notFound: 'Original' } },
      })
      MessageRegistry.addMessages({
        en: { errors: { notFound: 'Override' } },
      })

      const registry = new MessageRegistry()
      const merged = registry.getMergedMessages()

      expect(merged.en).toEqual({ errors: { notFound: 'Override' } })
    })

    it('should deep merge preserving non-overlapping keys', () => {
      MessageRegistry.addMessages({
        en: { errors: { notFound: 'Not found', generic: 'Error' } },
      })
      MessageRegistry.addMessages({
        en: { errors: { notFound: 'Overridden' } },
      })

      const registry = new MessageRegistry()
      const merged = registry.getMergedMessages()

      expect(merged.en).toEqual({
        errors: { notFound: 'Overridden', generic: 'Error' },
      })
    })

    it('should handle multiple locales independently', () => {
      MessageRegistry.addMessages({
        en: { common: { hello: 'Hello' } },
      })
      MessageRegistry.addMessages({
        sw: { common: { hello: 'Habari' } },
      })

      const registry = new MessageRegistry()
      const merged = registry.getMergedMessages()

      expect(merged.en).toEqual({ common: { hello: 'Hello' } })
      expect(merged.sw).toEqual({ common: { hello: 'Habari' } })
    })

    it('should handle multiple locales in a single contribution', () => {
      MessageRegistry.addMessages({
        en: { common: { hello: 'Hello' } },
        fr: { common: { hello: 'Bonjour' } },
      })

      const registry = new MessageRegistry()
      const merged = registry.getMergedMessages()

      expect(merged.en).toEqual({ common: { hello: 'Hello' } })
      expect(merged.fr).toEqual({ common: { hello: 'Bonjour' } })
    })

    it('should merge contributions from multiple packages for the same locale', () => {
      // App messages
      MessageRegistry.addMessages({
        en: { common: { hello: 'Hello' }, errors: { notFound: 'Not found' } },
        fr: { common: { hello: 'Bonjour' } },
      })
      // Tenancy package messages
      MessageRegistry.addMessages({
        en: { tenancy: { tenantNotFound: 'Tenant not found' } },
        fr: { tenancy: { tenantNotFound: 'Locataire introuvable' } },
      })
      // Compliance package messages
      MessageRegistry.addMessages({
        en: { compliance: { licenseRequired: 'License required' } },
      })

      const registry = new MessageRegistry()
      const merged = registry.getMergedMessages()

      expect(merged.en).toEqual({
        common: { hello: 'Hello' },
        errors: { notFound: 'Not found' },
        tenancy: { tenantNotFound: 'Tenant not found' },
        compliance: { licenseRequired: 'License required' },
      })
      expect(merged.fr).toEqual({
        common: { hello: 'Bonjour' },
        tenancy: { tenantNotFound: 'Locataire introuvable' },
      })
    })
  })

  describe('reset', () => {
    it('should clear all contributions', () => {
      MessageRegistry.addMessages({
        en: { common: { hello: 'Hello' } },
      })

      MessageRegistry.reset()

      const registry = new MessageRegistry()
      expect(registry.getMergedMessages()).toEqual({})
    })
  })

  describe('HMR reload re-registration', () => {
    const CONTRIBUTIONS_KEY = Symbol.for('stratal:i18n:message-registry:contributions')

    function contributionCount(): number {
      const store = (globalThis as Record<symbol, unknown>)[CONTRIBUTIONS_KEY] as Map<string, unknown> | undefined
      return store?.size ?? 0
    }

    it('should not grow when identical messages are re-registered (module re-evaluation)', () => {
      for (let reload = 0; reload < 5; reload++) {
        MessageRegistry.addMessages({ en: { common: { hello: 'Hello' } } })
        MessageRegistry.addMessages({ en: { errors: { notFound: 'Not found' } } })
      }

      expect(contributionCount()).toBe(2)
      expect(new MessageRegistry().getMergedMessages().en).toEqual({
        common: { hello: 'Hello' },
        errors: { notFound: 'Not found' },
      })
    })

    it('should treat key order as identical content', () => {
      MessageRegistry.addMessages({ en: { a: { x: '1' }, b: { y: '2' } } })
      MessageRegistry.addMessages({ en: { b: { y: '2' }, a: { x: '1' } } })

      expect(contributionCount()).toBe(1)
    })

    it('should keep latest registration order so re-registered modules retain override precedence', () => {
      // Initial evaluation: module A, then module B — B overrides A.
      MessageRegistry.addMessages({ en: { greeting: { hi: 'from-A' } } })
      MessageRegistry.addMessages({ en: { greeting: { hi: 'from-B' } } })

      // Reload after editing A: A' registers new content, B re-registers
      // identical content — B must still take precedence over A'.
      MessageRegistry.addMessages({ en: { greeting: { hi: 'from-A-edited' } } })
      MessageRegistry.addMessages({ en: { greeting: { hi: 'from-B' } } })

      expect(new MessageRegistry().getMergedMessages().en).toEqual({
        greeting: { hi: 'from-B' },
      })
    })
  })
})
