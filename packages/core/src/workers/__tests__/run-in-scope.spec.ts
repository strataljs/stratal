import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Application } from '../../application'
import type { Container } from '../../di/container'
import { Scope } from '../../di/types'
import type { StratalEnv } from '../../env'
import { LogLevel } from '../../logger'
import { Module } from '../../module/module.decorator'

const TOKEN = Symbol('TestSvc')

class TestService {
  getValue() { return 'from-run-in-scope' }
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

describe('runInScope', () => {
  let app: Application

  beforeEach(async () => {
    app = createTestApp()
    await app.initialize()
  })

  afterEach(async () => {
    await app.shutdown()
    vi.restoreAllMocks()
  })

  it('should create a request-scoped container and invoke the callback', async () => {
    const mockStratal = { getApplication: vi.fn().mockResolvedValue(app) }

    vi.doMock('cloudflare:workers', () => ({
      exports: { default: mockStratal },
    }))

    // Re-import to pick up the mock
    const { runInScope: mockedRunInScope } = await import('../run-in-scope')

    let receivedContainer: Container | undefined
    const result = await mockedRunInScope((container) => {
      receivedContainer = container
      return container.resolve<TestService>(TOKEN).getValue()
    })

    expect(result).toBe('from-run-in-scope')
    expect(receivedContainer).toBeDefined()
    expect(mockStratal.getApplication).toHaveBeenCalledOnce()
  })

  it('should dispose the request container after callback completes', async () => {
    const mockStratal = { getApplication: vi.fn().mockResolvedValue(app) }

    vi.doMock('cloudflare:workers', () => ({
      exports: { default: mockStratal },
    }))

    const { runInScope: mockedRunInScope } = await import('../run-in-scope')

    let capturedContainer: Container | undefined
    await mockedRunInScope((container) => {
      capturedContainer = container
    })

    // After callback, trying to resolve should throw because the container is disposed
    expect(() => capturedContainer!.resolve(TOKEN)).toThrow()
  })

  it('should propagate errors from the callback', async () => {
    const mockStratal = { getApplication: vi.fn().mockResolvedValue(app) }

    vi.doMock('cloudflare:workers', () => ({
      exports: { default: mockStratal },
    }))

    const { runInScope: mockedRunInScope } = await import('../run-in-scope')

    await expect(
      mockedRunInScope(() => {
        throw new Error('callback-error')
      })
    ).rejects.toThrow('callback-error')
  })
})
