import { beforeEach, describe, expect, it } from 'vitest'
import type { ConfigPath } from '../config.types'
import { ConfigService } from '../services/config.service'
import { ConfigNotInitializedError } from '../errors/config-not-initialized.error'

describe('ConfigService', () => {
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
    service = new ConfigService<TestConfig>()
    service.initialize(createConfig())
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

    it('should return undefined for non-existent path', () => {
      const result = service.get('nonexistent.path' as ConfigPath<TestConfig>)
      expect(result).toBeUndefined()
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

    it('should create intermediate objects for new paths', () => {
      service.set('new.nested.path' as ConfigPath<TestConfig>, 'value')
      expect(service.get('new.nested.path' as ConfigPath<TestConfig>)).toBe('value')
    })

    it('should not affect other values', () => {
      service.set('database.url', 'postgres://new')
      expect(service.get('database.port')).toBe(5432)
    })
  })

  describe('reset()', () => {
    it('should restore original value for specific path', () => {
      service.set('database.url', 'postgres://changed')
      service.reset('database.url')
      expect(service.get('database.url')).toBe('postgres://localhost')
    })

    it('should restore entire config to original when called without path', () => {
      service.set('database.url', 'changed')
      service.set('appName', 'Changed')
      service.reset()
      expect(service.get('database.url')).toBe('postgres://localhost')
      expect(service.get('appName')).toBe('TestApp')
    })
  })

  describe('all()', () => {
    it('should return full config object', () => {
      const result = service.all()
      expect(result).toEqual(createConfig())
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
  })

  describe('deep clone isolation', () => {
    it('should not affect original config when current config is modified and reset', () => {
      service.set('database.url', 'changed')
      service.reset()
      expect(service.get('database.url')).toBe('postgres://localhost')
    })

    it('should initialize with deep clone so original object mutations do not affect config', () => {
      const original = createConfig()
      const freshService = new ConfigService<TestConfig>()
      freshService.initialize(original)

      // Mutate original object
      original.database.url = 'mutated'

      // Config should not be affected
      expect(freshService.get('database.url')).toBe('postgres://localhost')
    })

    it('should deep clone on reset so mutations after reset do not affect original', () => {
      service.set('database.url', 'changed')
      service.reset('database.url')
      service.set('database.url', 'changed-again')
      service.reset('database.url')
      expect(service.get('database.url')).toBe('postgres://localhost')
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

    it('get() with __proto__ path should return undefined', () => {
      expect(service.get('__proto__.toString' as ConfigPath<TestConfig>)).toBeUndefined()
    })

    it('get() with constructor path should return undefined', () => {
      expect(service.get('constructor.prototype' as ConfigPath<TestConfig>)).toBeUndefined()
    })

    it('has() with __proto__ path should return false', () => {
      expect(service.has('__proto__.toString' as ConfigPath<TestConfig>)).toBe(false)
    })
  })

  describe('error handling', () => {
    it('should throw ConfigNotInitializedError when accessing before initialize()', () => {
      const uninitializedService = new ConfigService<TestConfig>()
      expect(() => uninitializedService.get('any' as ConfigPath<TestConfig>)).toThrow(ConfigNotInitializedError)
    })

    it('should throw ConfigNotInitializedError for has() before initialize()', () => {
      const uninitializedService = new ConfigService<TestConfig>()
      expect(() => uninitializedService.has('any' as ConfigPath<TestConfig>)).toThrow(ConfigNotInitializedError)
    })

    it('should throw ConfigNotInitializedError for all() before initialize()', () => {
      const uninitializedService = new ConfigService<TestConfig>()
      expect(() => uninitializedService.all()).toThrow(ConfigNotInitializedError)
    })

    it('should throw ConfigNotInitializedError for set() before initialize()', () => {
      const uninitializedService = new ConfigService<TestConfig>()
      expect(() => uninitializedService.set('any' as ConfigPath<TestConfig>, 'value')).toThrow(ConfigNotInitializedError)
    })

    it('should throw ConfigNotInitializedError for reset() before initialize()', () => {
      const uninitializedService = new ConfigService<TestConfig>()
      expect(() => uninitializedService.reset()).toThrow(ConfigNotInitializedError)
    })
  })
})
