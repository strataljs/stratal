import { beforeEach, describe, expect, it } from 'vitest'
import type { ConfigPath } from '../config.types'
import { ConfigService } from '../services/config.service'
import { ConfigStore } from '../services/config.store'
import { ConfigError } from '../config.error'

describe('ConfigService', () => {
  let store: ConfigStore<TestConfig>
  let service: ConfigService<TestConfig>

  interface TestConfig {
    database: {
      url: string
      port: number
    }
    email: {
      from: {
        name: string
        address: string
      }
    }
    appName: string
  }

  const createConfig = (): TestConfig => ({
    database: {
      url: 'postgres://localhost',
      port: 5432,
    },
    email: {
      from: {
        name: 'Test App',
        address: 'test@example.com',
      },
    },
    appName: 'TestApp',
  })

  beforeEach(() => {
    store = new ConfigStore<TestConfig>()
    store.initialize(createConfig())
    service = new ConfigService<TestConfig>(store)
  })

  describe('get()', () => {
    it('should return exact value via dot notation', () => {
      const result = service.get('database.url')
      expect(result).toBe('postgres://localhost')
    })

    it('should return nested value', () => {
      const result = service.get('email.from.name')
      expect(result).toBe('Test App')
    })

    it('should throw ConfigError for non-existent path', () => {
      expect(() => service.get('nonexistent.path' as ConfigPath<TestConfig>)).toThrow(ConfigError)
    })

    it('should include the requested path in the thrown error message', () => {
      try {
        service.get('nonexistent.path' as ConfigPath<TestConfig>)
        expect.fail('Expected ConfigError to be thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError)
        expect((error as ConfigError).message).toContain('nonexistent.path')
      }
    })

    it('should return top-level value', () => {
      const result = service.get('appName')
      expect(result).toBe('TestApp')
    })

    it('should return object for intermediate path', () => {
      const result = service.get('database')
      expect(result).toEqual({ url: 'postgres://localhost', port: 5432 })
    })
  })

  describe('set()', () => {
    it('should override value and get() returns new value', () => {
      service.set('database.url', 'postgres://production')
      expect(service.get('database.url')).toBe('postgres://production')
    })

    it('should create override for new paths', () => {
      service.set('new.nested.path' as ConfigPath<TestConfig>, 'value')
      expect(service.get('new.nested.path' as ConfigPath<TestConfig>)).toBe('value')
    })

    it('should not affect other values', () => {
      service.set('database.url', 'postgres://new')
      expect(service.get('database.port')).toBe(5432)
    })

    it('should not leak overrides into the shared store', () => {
      service.set('database.url', 'postgres://override')
      expect(store.get('database.url')).toBe('postgres://localhost')
    })
  })

  describe('reset()', () => {
    it('should restore original value for specific path', () => {
      service.set('database.url', 'postgres://changed')
      service.reset('database.url')
      expect(service.get('database.url')).toBe('postgres://localhost')
    })

    it('should clear all overrides when called without a path', () => {
      service.set('database.url', 'changed')
      service.set('appName', 'Changed')
      service.reset()
      expect(service.get('database.url')).toBe('postgres://localhost')
      expect(service.get('appName')).toBe('TestApp')
    })
  })

  describe('all()', () => {
    it('should return full config object when no overrides are set', () => {
      const result = service.all()
      expect(result).toEqual(createConfig())
    })

    it('should merge request overrides into the returned snapshot', () => {
      service.set('database.url', 'postgres://override')
      const result = service.all()
      expect(result.database.url).toBe('postgres://override')
      expect(result.database.port).toBe(5432)
    })

    it('should not mutate the shared store when merging overrides', () => {
      service.set('database.url', 'postgres://override')
      service.all()
      expect(store.all().database.url).toBe('postgres://localhost')
    })
  })

  describe('has()', () => {
    it('should return true for existing path', () => {
      expect(service.has('database.url')).toBe(true)
    })

    it('should return false for non-existent path', () => {
      expect(service.has('nonexistent.key' as ConfigPath<TestConfig>)).toBe(false)
    })

    it('should return true for intermediate path', () => {
      expect(service.has('database')).toBe(true)
    })

    it('should return true for paths only present in overrides', () => {
      service.set('new.path' as ConfigPath<TestConfig>, 'value')
      expect(service.has('new.path' as ConfigPath<TestConfig>)).toBe(true)
    })
  })

  describe('request isolation', () => {
    it('two ConfigService instances over the same store have independent overrides', () => {
      const a = new ConfigService<TestConfig>(store)
      const b = new ConfigService<TestConfig>(store)

      a.set('database.url', 'postgres://request-a')
      b.set('database.url', 'postgres://request-b')

      expect(a.get('database.url')).toBe('postgres://request-a')
      expect(b.get('database.url')).toBe('postgres://request-b')
      expect(store.get('database.url')).toBe('postgres://localhost')
    })

    it('resetting one instance does not touch another instance', () => {
      const a = new ConfigService<TestConfig>(store)
      const b = new ConfigService<TestConfig>(store)

      a.set('appName', 'Alpha')
      b.set('appName', 'Beta')
      a.reset()

      expect(a.get('appName')).toBe('TestApp')
      expect(b.get('appName')).toBe('Beta')
    })
  })

  describe('deep clone isolation', () => {
    it('should not affect original config when overrides are reset', () => {
      service.set('database.url', 'changed')
      service.reset()
      expect(service.get('database.url')).toBe('postgres://localhost')
    })

    it('should initialize with deep clone so original object mutations do not affect config', () => {
      const original = createConfig()
      const freshStore = new ConfigStore<TestConfig>()
      freshStore.initialize(original)
      const freshService = new ConfigService<TestConfig>(freshStore)

      // Mutate the original object after initialization
      original.database.url = 'mutated'

      expect(freshService.get('database.url')).toBe('postgres://localhost')
    })
  })

  describe('prototype pollution prevention', () => {
    it('set() with __proto__ path should not modify config', () => {
      service.set('__proto__.isAdmin' as ConfigPath<TestConfig>, 'malicious')
      expect(service.all()).toEqual(createConfig())
    })

    it('set() with constructor.prototype path should not modify config', () => {
      service.set('constructor.prototype.isAdmin' as ConfigPath<TestConfig>, 'malicious')
      expect(service.all()).toEqual(createConfig())
    })

    it('get() with __proto__ path should throw ConfigError', () => {
      expect(() => service.get('__proto__.toString' as ConfigPath<TestConfig>)).toThrow(ConfigError)
    })

    it('get() with constructor path should throw ConfigError', () => {
      expect(() => service.get('constructor.prototype' as ConfigPath<TestConfig>)).toThrow(ConfigError)
    })

    it('has() with __proto__ path should return false', () => {
      expect(service.has('__proto__.toString' as ConfigPath<TestConfig>)).toBe(false)
    })

    it('set() should not traverse inherited prototype properties', () => {
      service.set('toString.polluted' as ConfigPath<TestConfig>, 'malicious')
      expect(Object.prototype).not.toHaveProperty('polluted')
      expect(service.get('toString.polluted' as ConfigPath<TestConfig>)).toBe('malicious')
    })
  })

  describe('uninitialized store', () => {
    it('get() throws ConfigError for any key when the store was never initialized', () => {
      const uninitializedStore = new ConfigStore<TestConfig>()
      const uninitialized = new ConfigService<TestConfig>(uninitializedStore)
      expect(() => uninitialized.get('appName' as ConfigPath<TestConfig>)).toThrow(ConfigError)
    })

    it('has() returns false on an uninitialized store (no throw)', () => {
      const uninitializedStore = new ConfigStore<TestConfig>()
      const uninitialized = new ConfigService<TestConfig>(uninitializedStore)
      expect(uninitialized.has('appName' as ConfigPath<TestConfig>)).toBe(false)
    })

    it('all() returns an empty object on an uninitialized store (no throw)', () => {
      const uninitializedStore = new ConfigStore<TestConfig>()
      const uninitialized = new ConfigService<TestConfig>(uninitializedStore)
      expect(uninitialized.all()).toEqual({})
    })

    it('set() is allowed on an uninitialized store and is readable via the override layer', () => {
      const uninitializedStore = new ConfigStore<TestConfig>()
      const uninitialized = new ConfigService<TestConfig>(uninitializedStore)
      expect(() => uninitialized.set('appName' as ConfigPath<TestConfig>, 'Override')).not.toThrow()
      expect(uninitialized.get('appName' as ConfigPath<TestConfig>)).toBe('Override')
      expect(uninitialized.has('appName' as ConfigPath<TestConfig>)).toBe(true)
    })

    it('all() merges request overrides into the empty base when uninitialized', () => {
      const uninitializedStore = new ConfigStore<TestConfig>()
      const uninitialized = new ConfigService<TestConfig>(uninitializedStore)
      uninitialized.set('appName' as ConfigPath<TestConfig>, 'Override')
      expect(uninitialized.all()).toEqual({ appName: 'Override' })
    })
  })
})
