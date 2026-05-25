import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Application } from '../../application';
import type { Container } from '../../di/container';
import { DI_TOKENS } from '../../di/tokens';
import { Scope } from '../../di/types';
import type { StratalEnv } from '../../env';
import type { EventContext, IEventRegistry } from '../../events';
import { Listener, On } from '../../events';
import { LogLevel } from '../../logger';
import { Module } from '../../module/module.decorator';
import { Stratal } from '../../stratal';
import { runInScope } from '../run-in-scope';
import { forceGc } from './__helpers__/force-gc';

const TOKEN = Symbol('TestSvc')

class TestService {
  getValue() { return 'from-run-in-scope' }
}

const listenerInvocations: string[] = []

@Listener()
class TestEventListener {
  @On('test.run-in-scope.event' as never)
   handle(ctx: EventContext<never>) {
    listenerInvocations.push((ctx as { data?: { tag?: string } }).data?.tag ?? 'no-tag')
  }
}

@Module({
  providers: [
    { provide: TOKEN, useClass: TestService, scope: Scope.Singleton },
    TestEventListener,
  ],
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
    listenerInvocations.length = 0
    app = createTestApp()
    await app.initialize()
    vi.spyOn(Stratal, 'resolveApplication').mockResolvedValue(app)
  })

  afterEach(async () => {
    await app.shutdown()
    vi.restoreAllMocks()
  })

  it('should create a request-scoped container and invoke the callback', async () => {
    let receivedContainer: Container | undefined
    const result = await runInScope((container) => {
      receivedContainer = container
      return container.resolve<TestService>(TOKEN).getValue()
    })

    expect(result).toBe('from-run-in-scope')
    expect(receivedContainer).toBeDefined()
    expect(Stratal.resolveApplication).toHaveBeenCalledOnce()
  })

  it('should release the request container for garbage collection after callback completes', async () => {
    let weakRef: WeakRef<Container> | undefined
    await runInScope((container) => {
      weakRef = new WeakRef(container)
    })

    await forceGc()

    expect(weakRef!.deref()).toBeUndefined()
  })

  it('should propagate errors from the callback', async () => {
    await expect(
      runInScope(() => {
        throw new Error('callback-error')
      })
    ).rejects.toThrow('callback-error')
  })

  it('should register @Listener() handlers so events emitted inside runInScope fire', async () => {
    await runInScope(async (container) => {
      const events = container.resolve<IEventRegistry>(DI_TOKENS.EventRegistry)
      await events.emit('test.run-in-scope.event' as never, {
        data: { tag: 'fired' },
      } as never)
    })

    expect(listenerInvocations).toEqual(['fired'])
  })
})
