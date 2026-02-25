import { describe, expect, it } from 'vitest'
import { DI_TOKENS } from '../../di/tokens'
import { registerAs } from '../register-as'

describe('registerAs', () => {
  it('should return object with KEY = Symbol.for("CONFIG:namespace")', () => {
    const config = registerAs('database', () => ({ url: 'test' }))
    expect(config.KEY).toBe(Symbol.for('CONFIG:database'))
  })

  it('should set namespace property', () => {
    const config = registerAs('database', () => ({ url: 'test' }))
    expect(config.namespace).toBe('database')
  })

  it('should call factory with env and return config', () => {
    const factory = (env: { DB_URL: string }) => ({ url: env.DB_URL })
    const config = registerAs('database', factory)
    const result = config.factory({ DB_URL: 'postgres://localhost' })
    expect(result).toEqual({ url: 'postgres://localhost' })
  })

  it('should generate unique symbols for different namespaces', () => {
    const dbConfig = registerAs('database', () => ({}))
    const emailConfig = registerAs('email', () => ({}))
    expect(dbConfig.KEY).not.toBe(emailConfig.KEY)
    expect(dbConfig.KEY).toBe(Symbol.for('CONFIG:database'))
    expect(emailConfig.KEY).toBe(Symbol.for('CONFIG:email'))
  })

  describe('asProvider()', () => {
    it('should return provider with correct provide, useFactory, and inject', () => {
      const factory = (env: { DB_URL: string }) => ({ url: env.DB_URL })
      const config = registerAs('database', factory)
      const provider = config.asProvider()

      expect(provider).toEqual({
        provide: Symbol.for('CONFIG:database'),
        useFactory: factory,
        inject: [DI_TOKENS.CloudflareEnv],
      })
    })

    it('should use the same KEY as the config namespace', () => {
      const config = registerAs('email', () => ({ from: 'test' }))
      const provider = config.asProvider()
      expect(provider.provide).toBe(config.KEY)
    })

    it('should reference the same factory function', () => {
      const factory = () => ({ value: 42 })
      const config = registerAs('custom', factory)
      const provider = config.asProvider()
      expect(provider.useFactory).toBe(factory)
    })
  })
})
