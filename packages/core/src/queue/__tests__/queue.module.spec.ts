import { createMock } from '@stratal/testing/mocks'
import { describe, expect, it } from 'vitest'
import { DI_TOKENS } from '../../di/tokens'
import type { Container } from '../../di/container'
import type { LoggerService } from '../../logger'
import type { ModuleContext } from '../../module/types'
import { QueueError } from '../queue.error'
import { QueueModule } from '../queue.module'
import type { QueueModuleOptions } from '../queue.module'
import { QUEUE_TOKENS } from '../queue.tokens'

function makeContext(
  options: QueueModuleOptions,
  env: Record<string, unknown>,
): ModuleContext {
  const container = {
    resolve: (token: unknown) => {
      if (token === QUEUE_TOKENS.QueueModuleOptions) return options
      if (token === DI_TOKENS.CloudflareEnv) return env
      throw new Error(`Unexpected token resolved: ${String(token)}`)
    },
  } as unknown as Container

  return { container, logger: createMock<LoggerService>() }
}

describe('QueueModule.onInitialize', () => {
  it('throws a clear QueueError when the default CACHE binding is missing', () => {
    const module = new QueueModule()
    const ctx = makeContext({ provider: 'cloudflare' }, { ENVIRONMENT: 'test' })

    expect(() => module.onInitialize(ctx)).toThrow(QueueError)
    expect(() => module.onInitialize(ctx)).toThrow(/CACHE/)
  })

  it('throws naming the configured binding when it is missing', () => {
    const module = new QueueModule()
    const ctx = makeContext(
      { provider: 'cloudflare', store: { binding: 'QUEUE_KV' } },
      { ENVIRONMENT: 'test' },
    )

    expect(() => module.onInitialize(ctx)).toThrow(/QUEUE_KV/)
  })

  it('does not throw when the binding is present', () => {
    const module = new QueueModule()
    const ctx = makeContext(
      { provider: 'cloudflare' },
      { ENVIRONMENT: 'test', CACHE: {} },
    )

    expect(() => module.onInitialize(ctx)).not.toThrow()
  })
})
