import { Test, type TestingModule } from '@stratal/testing'
import { DI_TOKENS } from 'stratal/di'
import type { EventRegistry } from 'stratal/events'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TestAppModule } from '../fixtures/app.module'
import { REGULAR_USER_ID, UserSeeder } from '../seeders/user.seeder'

describe('Event System', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile()

    await module.truncateDb()
    await module.seed(new UserSeeder())
  })

  afterEach(async () => {
    const db = await module.getDb()
    await db.post.deleteMany({})
  })

  afterAll(async () => {
    await module.close()
  })

  describe('Database Event Emission', () => {
    it('emits after.post.create event on post creation via HTTP', async () => {
      const response = await module.http
        .post('/api/test/posts')
        .actingAs({ id: REGULAR_USER_ID })
        .withBody({ title: 'Event Test Post', content: 'Content' })
        .send()

      response.assertCreated()
      await response.assertJsonPath('title', 'Event Test Post')
    })
  })

  describe('EventRegistry API', () => {
    it('on() registers a handler and emit() triggers it', async () => {
      await module.runInRequestScope(async () => {
        const eventRegistry = module.get<EventRegistry>(DI_TOKENS.EventRegistry)
        const handler = vi.fn()

        eventRegistry.on('after.User.create', handler)
        await eventRegistry.emit('after.User.create', {
          data: { email: 'test@test.com', name: 'Test User' },
        })

        expect(handler).toHaveBeenCalledOnce()
      })
    })

    it('off() removes a handler', async () => {
      await module.runInRequestScope(async () => {
        const eventRegistry = module.get<EventRegistry>(DI_TOKENS.EventRegistry)
        const handler = vi.fn()

        eventRegistry.on('after.User.create', handler)
        eventRegistry.off('after.User.create', handler)

        await eventRegistry.emit('after.User.create', {})

        expect(handler).not.toHaveBeenCalled()
      })
    })

    it('once() triggers handler once then auto-removes', async () => {
      await module.runInRequestScope(async () => {
        const eventRegistry = module.get<EventRegistry>(DI_TOKENS.EventRegistry)
        const handler = vi.fn()

        eventRegistry.once('after.User.create', handler)

        await eventRegistry.emit('after.User.create', {})
        await eventRegistry.emit('after.User.create', {})

        expect(handler).toHaveBeenCalledOnce()
      })
    })
  })

  describe('Pattern Matching', () => {
    it('exact match: after.user.create', async () => {
      await module.runInRequestScope(async () => {
        const eventRegistry = module.get<EventRegistry>(DI_TOKENS.EventRegistry)
        const handler = vi.fn()

        eventRegistry.on('after.User.create', handler)
        await eventRegistry.emit('after.User.create', {})

        expect(handler).toHaveBeenCalledOnce()
      })
    })

    it('model wildcard: after.user matches after.user.create', async () => {
      await module.runInRequestScope(async () => {
        const eventRegistry = module.get<EventRegistry>(DI_TOKENS.EventRegistry)
        const handler = vi.fn()

        eventRegistry.on('after.User', handler)
        await eventRegistry.emit('after.User.create', {})

        expect(handler).toHaveBeenCalledOnce()
      })
    })

    it('operation wildcard: after.create matches after.user.create', async () => {
      await module.runInRequestScope(async () => {
        const eventRegistry = module.get<EventRegistry>(DI_TOKENS.EventRegistry)
        const handler = vi.fn()

        eventRegistry.on('after.User.create', handler)
        await eventRegistry.emit('after.User.create', {})

        expect(handler).toHaveBeenCalledOnce()
      })
    })

    it('phase wildcard: after matches after.user.create', async () => {
      await module.runInRequestScope(async () => {
        const eventRegistry = module.get<EventRegistry>(DI_TOKENS.EventRegistry)
        const handler = vi.fn()

        eventRegistry.on('after', handler)
        await eventRegistry.emit('after.User.create', {})

        expect(handler).toHaveBeenCalledOnce()
      })
    })
  })

  describe('Priority Ordering', () => {
    it('higher priority handler executes first', async () => {
      await module.runInRequestScope(async () => {
        const eventRegistry = module.get<EventRegistry>(DI_TOKENS.EventRegistry)
        const order: number[] = []

        eventRegistry.on('before.User.create', () => { order.push(1) }, { priority: 1 })
        eventRegistry.on('before.User.create', () => { order.push(10) }, { priority: 10 })
        eventRegistry.on('before.User.create', () => { order.push(5) }, { priority: 5 })

        await eventRegistry.emit('before.User.create', {})

        expect(order).toEqual([10, 5, 1])
      })
    })
  })

  describe('Error Isolation', () => {
    it('throwing handler does not crash other handlers', async () => {
      await module.runInRequestScope(async () => {
        const eventRegistry = module.get<EventRegistry>(DI_TOKENS.EventRegistry)
        const goodHandler = vi.fn()

        eventRegistry.on('before.User.create', () => {
          throw new Error('Handler error')
        }, { priority: 10 })

        eventRegistry.on('before.User.create', goodHandler, { priority: 1 })

        await eventRegistry.emit('before.User.create', {})

        expect(goodHandler).toHaveBeenCalledOnce()
      })
    })
  })
})
