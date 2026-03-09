import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Application } from '../../application'
import type { Container } from '../../di/container'
import { Scope } from '../../di/types'
import type { StratalEnv } from '../../env'
import { LogLevel } from '../../logger'
import { Module } from '../../module/module.decorator'
import { Stratal } from '../../stratal'

const TOKEN = Symbol('TestSvc')

class TestService {
  getValue() { return 'from-workflow' }
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

describe('StratalWorkflow', () => {
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
      WorkflowEntrypoint: class {
        ctx: unknown
        env: unknown
        constructor(ctx: unknown, env: unknown) {
          this.ctx = ctx
          this.env = env
        }
      },
    }))

    const { StratalWorkflow } = await import('../stratal-workflow')

    class TestWorkflow extends StratalWorkflow {
      async testRunInScope() {
        return this.runInScope((container) => {
          return container.resolve<TestService>(TOKEN).getValue()
        })
      }
    }

    const workflow = new TestWorkflow({} as never, mockEnv)
    const result = await workflow.testRunInScope()

    expect(result).toBe('from-workflow')
    expect(Stratal.resolveApplication).toHaveBeenCalledOnce()
  })

  it('should dispose the request container after callback completes', async () => {
    vi.doMock('cloudflare:workers', () => ({
      WorkflowEntrypoint: class {
        ctx: unknown
        env: unknown
        constructor(ctx: unknown, env: unknown) {
          this.ctx = ctx
          this.env = env
        }
      },
    }))

    const { StratalWorkflow } = await import('../stratal-workflow')

    class TestWorkflow extends StratalWorkflow {
      async testRunInScope() {
        let capturedContainer: Container | undefined
        await this.runInScope((container) => {
          capturedContainer = container
        })
        return capturedContainer
      }
    }

    const workflow = new TestWorkflow({} as never, mockEnv)
    const container = await workflow.testRunInScope()

    expect(() => container!.resolve(TOKEN)).toThrow()
  })
})
