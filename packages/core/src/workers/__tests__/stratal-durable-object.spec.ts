import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Application } from '../../application'
import type { Container } from '../../di/container'
import { DI_TOKENS } from '../../di/tokens'
import { Scope } from '../../di/types'
import type { StratalEnv } from '../../env'
import { LogLevel } from '../../logger'
import { Module } from '../../module/module.decorator'
import { Stratal } from '../../stratal'
import { forceGc } from './__helpers__/force-gc'

const TOKEN = Symbol('TestSvc')

class TestService {
  getValue() { return 'from-durable-object' }
}

@Module({
  providers: [{ provide: TOKEN, useClass: TestService, scope: Scope.Singleton }],
})
class TestAppModule {}

const mockEnv = { ENVIRONMENT: 'test' } as StratalEnv

function createTestApp(): Application {
  return new Application({
    module: TestAppModule,
    logging: { level: LogLevel.ERROR },
    env: mockEnv,
    ctx: { waitUntil: vi.fn() },
  })
}

describe('StratalDurableObject', () => {
  let app: Application

  beforeEach(async () => {
    app = createTestApp()
    await app.initialize()
    vi.spyOn(Stratal, 'resolveApplication').mockResolvedValue(app)
  })

  afterEach(async () => {
    await app.shutdown()
    vi.restoreAllMocks()
  })

  it('should create a request-scoped container with DO tokens registered', async () => {
    const mockState = {
      id: { toString: () => 'test-do-id' },
      storage: {},
      waitUntil: vi.fn(),
    }

    // Mock cloudflare:workers for the DurableObject base class only
    vi.doMock('cloudflare:workers', () => ({
      DurableObject: class {
        ctx: unknown
        env: unknown
        constructor(ctx: unknown, env: unknown) {
          this.ctx = ctx
          this.env = env
        }
      },
    }))

    const { StratalDurableObject } = await import('../stratal-durable-object')

    class TestDO extends StratalDurableObject {
      async testRunInScope() {
        return this.runInScope((container) => {
          const state = container.resolve(DI_TOKENS.DurableObjectState)
          const id = container.resolve(DI_TOKENS.DurableObjectId)
          const svc = container.resolve<TestService>(TOKEN)
          return { state, id, value: svc.getValue() }
        })
      }
    }

    const doInstance = new TestDO(mockState as never, mockEnv)
    const result = await doInstance.testRunInScope()

    expect(result.state).toBe(mockState)
    expect(result.id).toBe(mockState.id)
    expect(result.value).toBe('from-durable-object')
  })

  it('should release the request container for garbage collection after callback completes', async () => {
    const mockState = {
      id: { toString: () => 'test-do-id' },
      storage: {},
      waitUntil: vi.fn(),
    }

    vi.doMock('cloudflare:workers', () => ({
      DurableObject: class {
        ctx: unknown
        env: unknown
        constructor(ctx: unknown, env: unknown) {
          this.ctx = ctx
          this.env = env
        }
      },
    }))

    const { StratalDurableObject } = await import('../stratal-durable-object')

    class TestDO extends StratalDurableObject {
      async testRunInScope() {
        let weakRef: WeakRef<Container> | undefined
        await this.runInScope((container) => {
          weakRef = new WeakRef(container)
        })
        return weakRef
      }
    }

    const doInstance = new TestDO(mockState as never, mockEnv)
    const weakRef = await doInstance.testRunInScope()

    await forceGc()

    expect(weakRef!.deref()).toBeUndefined()
  })
})
