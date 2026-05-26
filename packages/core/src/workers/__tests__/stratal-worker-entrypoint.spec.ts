import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Application } from '../../application'
import type { Container } from '../../di/container'
import type { StratalEnv } from '../../env'
import { LogLevel } from '../../logger'
import { Module } from '../../module/module.decorator'
import { Stratal } from '../../stratal'
import { forceGc } from './__helpers__/force-gc'

const TOKEN = Symbol('TestSvc')

class TestService {
  getValue() { return 'from-worker-entrypoint' }
}

@Module({
  providers: [{ provide: TOKEN, useClass: TestService }],
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

describe('StratalWorkerEntrypoint', () => {
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

  it('should create a request-scoped container and invoke the callback', async () => {
    vi.doMock('cloudflare:workers', () => ({
      WorkerEntrypoint: class {
        ctx: unknown
        env: unknown
        constructor(ctx: unknown, env: unknown) {
          this.ctx = ctx
          this.env = env
        }
      },
    }))

    const { StratalWorkerEntrypoint } = await import('../stratal-worker-entrypoint')

    class TestEntrypoint extends StratalWorkerEntrypoint {
      async testRunInScope() {
        return this.runInScope((container) => {
          return container.resolve<TestService>(TOKEN).getValue()
        })
      }
    }

    const entrypoint = new TestEntrypoint({} as never, mockEnv)
    const result = await entrypoint.testRunInScope()

    expect(result).toBe('from-worker-entrypoint')
    expect(Stratal.resolveApplication).toHaveBeenCalledOnce()
  })

  it('should release the request container for garbage collection after callback completes', async () => {
    vi.doMock('cloudflare:workers', () => ({
      WorkerEntrypoint: class {
        ctx: unknown
        env: unknown
        constructor(ctx: unknown, env: unknown) {
          this.ctx = ctx
          this.env = env
        }
      },
    }))

    const { StratalWorkerEntrypoint } = await import('../stratal-worker-entrypoint')

    class TestEntrypoint extends StratalWorkerEntrypoint {
      async testRunInScope() {
        let weakRef: WeakRef<Container> | undefined
        await this.runInScope((container) => {
          weakRef = new WeakRef(container)
        })
        return weakRef
      }
    }

    const entrypoint = new TestEntrypoint({} as never, mockEnv)
    const weakRef = await entrypoint.testRunInScope()

    await forceGc()

    expect(weakRef!.deref()).toBeUndefined()
  })
})
