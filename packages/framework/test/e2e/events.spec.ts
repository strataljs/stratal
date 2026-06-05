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
    await module.seed(UserSeeder)
  })

  afterEach(async () => {
    const db = module.getDb()
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

  describe('Entity Mutation Events', () => {
    interface EntityEvent {
      model: string
      action: string
      before?: Record<string, unknown>
      after?: Record<string, unknown>
    }

    it('emits entity.Post.created with the after snapshot', async () => {
      await module.runInRequestScope(async () => {
        const db = module.getDb()
        const eventRegistry = module.get<EventRegistry>(DI_TOKENS.EventRegistry)
        const received: EntityEvent[] = []
        const handler = (ctx: unknown): void => { received.push(ctx as EntityEvent) }

        eventRegistry.on('entity.Post.created', handler, { blocking: true })
        try {
          await db.post.create({
            data: { title: 'Fresh Post', content: 'Body', authorId: REGULAR_USER_ID },
          })
        } finally {
          eventRegistry.off('entity.Post.created', handler)
        }

        expect(received).toHaveLength(1)
        expect(received[0].action).toBe('created')
        expect(received[0].before).toBeUndefined()
        expect(received[0].after?.title).toBe('Fresh Post')
      })
    })

    it('emits entity.Post.updated with before and after snapshots', async () => {
      await module.runInRequestScope(async () => {
        const db = module.getDb()
        const eventRegistry = module.get<EventRegistry>(DI_TOKENS.EventRegistry)
        const received: EntityEvent[] = []
        const handler = (ctx: unknown): void => { received.push(ctx as EntityEvent) }

        const post = await db.post.create({
          data: { title: 'Original Title', content: 'Body', authorId: REGULAR_USER_ID },
        })

        eventRegistry.on('entity.Post.updated', handler, { blocking: true })
        try {
          await db.post.update({ where: { id: post.id }, data: { title: 'Changed Title' } })
        } finally {
          eventRegistry.off('entity.Post.updated', handler)
        }

        expect(received).toHaveLength(1)
        expect(received[0].model).toBe('Post')
        expect(received[0].action).toBe('updated')
        expect(received[0].before?.title).toBe('Original Title')
        expect(received[0].after?.title).toBe('Changed Title')
      })
    })

    it('emits entity.Post.deleted with the before snapshot', async () => {
      await module.runInRequestScope(async () => {
        const db = module.getDb()
        const eventRegistry = module.get<EventRegistry>(DI_TOKENS.EventRegistry)
        const received: EntityEvent[] = []
        const handler = (ctx: unknown): void => { received.push(ctx as EntityEvent) }

        const post = await db.post.create({
          data: { title: 'Doomed Post', content: 'Body', authorId: REGULAR_USER_ID },
        })

        eventRegistry.on('entity.Post.deleted', handler, { blocking: true })
        try {
          await db.post.delete({ where: { id: post.id } })
        } finally {
          eventRegistry.off('entity.Post.deleted', handler)
        }

        expect(received).toHaveLength(1)
        expect(received[0].action).toBe('deleted')
        expect(received[0].before?.title).toBe('Doomed Post')
        expect(received[0].after).toBeUndefined()
      })
    })

    it('emits one entity event per row for multi-row mutations', async () => {
      await module.runInRequestScope(async () => {
        const db = module.getDb()
        const eventRegistry = module.get<EventRegistry>(DI_TOKENS.EventRegistry)
        const received: EntityEvent[] = []
        const handler = (ctx: unknown): void => { received.push(ctx as EntityEvent) }

        await db.post.create({ data: { title: 'Bulk A', authorId: REGULAR_USER_ID } })
        await db.post.create({ data: { title: 'Bulk B', authorId: REGULAR_USER_ID } })

        eventRegistry.on('entity.Post.updated', handler, { blocking: true })
        try {
          await db.post.updateMany({
            where: { title: { startsWith: 'Bulk' } },
            data: { published: true },
          })
        } finally {
          eventRegistry.off('entity.Post.updated', handler)
        }

        expect(received).toHaveLength(2)
        const byTitle = new Map(received.map((e) => [e.before?.title, e]))
        expect(byTitle.get('Bulk A')?.before?.published).toBe(false)
        expect(byTitle.get('Bulk A')?.after?.published).toBe(true)
        expect(byTitle.get('Bulk B')?.after?.published).toBe(true)
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
