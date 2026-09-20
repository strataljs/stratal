// `forRootAsync` takes a factory typed `TOptions | Promise<TOptions>`. This is
// the half of that contract the runtime has to keep: a factory that actually
// returns a promise.
//
// What it is for is a schema behind an `import()`. A generated schema is a large
// object literal, and a static import evaluates it while the isolate starts —
// where the runtime's startup budget is spent and where a deploy is rejected for
// overrunning it. An async factory moves that to module initialization.
import { Test, type TestingModule } from '@stratal/testing'
import { DI_TOKENS } from 'stratal/di'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseModule } from '../../src/database/database.module'
import { connectionSymbol } from '../../src/database/database.tokens'
import { schema } from '../zenstack/schema'

describe('DatabaseModule.forRootAsync (asynchronous factory)', () => {
  let module: TestingModule | undefined

  afterEach(async () => {
    await module?.close()
    module = undefined
  })

  it('initializes from a factory that resolves its config asynchronously', async () => {
    const dialect = vi.fn()

    module = await Test.createTestingModule({
      imports: [
        DatabaseModule.forRootAsync({
          // The shape a dynamic schema import takes at a call site: the config
          // is only knowable once the import settles.
          useFactory: async () => {
            await Promise.resolve()
            return { default: 'main', connections: [{ name: 'main', schema, dialect }] }
          },
        }),
      ],
    }).compile()

    // The registration, not a resolution: what an unawaited factory breaks is
    // `onInitialize` walking a Promise's `connections` — `undefined` — so the
    // connection is never registered. Resolving one would also construct a
    // client, which fails or succeeds for reasons of its own.
    expect(module.container.isRegistered(connectionSymbol('main'))).toBe(true)
    expect(module.container.isRegistered(DI_TOKENS.Database)).toBe(true)
  })
})
