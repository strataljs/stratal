import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import type { OperationNode, QueryId } from 'kysely'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IEventRegistry } from 'stratal/events'
import { EventEmitterPlugin } from '../event-emitter.plugin'

type BeforeHookArgs = Parameters<NonNullable<NonNullable<EventEmitterPlugin['onEntityMutation']>['beforeEntityMutation']>>[0]
type AfterHookArgs = Parameters<NonNullable<NonNullable<EventEmitterPlugin['onEntityMutation']>['afterEntityMutation']>>[0]

describe('EventEmitterPlugin entity mutation events', () => {
  let registry: DeepMocked<IEventRegistry>
  let plugin: EventEmitterPlugin

  const queryId = createMock<QueryId>()
  const queryNode = createMock<OperationNode>()
  const client = createMock<BeforeHookArgs['client']>()

  beforeEach(() => {
    vi.clearAllMocks()
    registry = createMock<IEventRegistry>()
    registry.emit.mockResolvedValue(undefined)
    plugin = new EventEmitterPlugin({ eventRegistry: registry })
  })

  function beforeArgs(overrides: Partial<BeforeHookArgs> = {}): BeforeHookArgs {
    return {
      model: 'Post',
      action: 'update',
      queryNode,
      queryId,
      loadBeforeMutationEntities: vi.fn().mockResolvedValue([{ id: '1', title: 'old' }]),
      client,
      ...overrides,
    }
  }

  function afterArgs(overrides: Partial<AfterHookArgs> = {}): AfterHookArgs {
    return {
      model: 'Post',
      action: 'update',
      queryNode,
      queryId,
      loadAfterMutationEntities: vi.fn().mockResolvedValue([{ id: '1', title: 'new' }]),
      beforeMutationEntities: [{ id: '1', title: 'old' }],
      client,
      ...overrides,
    }
  }

  describe('beforeEntityMutation', () => {
    it('loads before-entities for update when a listener exists', async () => {
      registry.hasListeners.mockReturnValue(true)
      const args = beforeArgs()

      await plugin.onEntityMutation.beforeEntityMutation!(args)

      expect(registry.hasListeners).toHaveBeenCalledWith('entity.Post.updated')
      expect(args.loadBeforeMutationEntities).toHaveBeenCalledOnce()
    })

    it('does NOT load before-entities when no listener exists', async () => {
      registry.hasListeners.mockReturnValue(false)
      const args = beforeArgs()

      await plugin.onEntityMutation.beforeEntityMutation!(args)

      expect(args.loadBeforeMutationEntities).not.toHaveBeenCalled()
    })

    it('does NOT load before-entities for create (no prior state)', async () => {
      registry.hasListeners.mockReturnValue(true)
      const args = beforeArgs({ action: 'create' })

      await plugin.onEntityMutation.beforeEntityMutation!(args)

      expect(args.loadBeforeMutationEntities).not.toHaveBeenCalled()
    })

    it('loads before-entities for delete when a listener exists', async () => {
      registry.hasListeners.mockReturnValue(true)
      const args = beforeArgs({ action: 'delete' })

      await plugin.onEntityMutation.beforeEntityMutation!(args)

      expect(registry.hasListeners).toHaveBeenCalledWith('entity.Post.deleted')
      expect(args.loadBeforeMutationEntities).toHaveBeenCalledOnce()
    })
  })

  describe('afterEntityMutation', () => {
    it('emits entity.{Model}.updated with before/after for each entity', async () => {
      registry.hasListeners.mockReturnValue(true)
      const args = afterArgs()

      await plugin.onEntityMutation.afterEntityMutation!(args)

      expect(registry.emit).toHaveBeenCalledExactlyOnceWith('entity.Post.updated', {
        model: 'Post',
        action: 'updated',
        before: { id: '1', title: 'old' },
        after: { id: '1', title: 'new' },
      })
    })

    it('pairs before/after entities by id for multi-row mutations', async () => {
      registry.hasListeners.mockReturnValue(true)
      const args = afterArgs({
        loadAfterMutationEntities: vi.fn().mockResolvedValue([
          { id: 'b', n: 21 },
          { id: 'a', n: 11 },
        ]),
        beforeMutationEntities: [
          { id: 'a', n: 10 },
          { id: 'b', n: 20 },
        ],
      })

      await plugin.onEntityMutation.afterEntityMutation!(args)

      expect(registry.emit).toHaveBeenCalledTimes(2)
      expect(registry.emit).toHaveBeenCalledWith('entity.Post.updated', {
        model: 'Post',
        action: 'updated',
        before: { id: 'b', n: 20 },
        after: { id: 'b', n: 21 },
      })
      expect(registry.emit).toHaveBeenCalledWith('entity.Post.updated', {
        model: 'Post',
        action: 'updated',
        before: { id: 'a', n: 10 },
        after: { id: 'a', n: 11 },
      })
    })

    it('emits entity.{Model}.created with after only', async () => {
      registry.hasListeners.mockReturnValue(true)
      const args = afterArgs({
        action: 'create',
        beforeMutationEntities: undefined,
        loadAfterMutationEntities: vi.fn().mockResolvedValue([{ id: '9', title: 'fresh' }]),
      })

      await plugin.onEntityMutation.afterEntityMutation!(args)

      expect(registry.emit).toHaveBeenCalledExactlyOnceWith('entity.Post.created', {
        model: 'Post',
        action: 'created',
        before: undefined,
        after: { id: '9', title: 'fresh' },
      })
    })

    it('emits entity.{Model}.deleted with before only and does not load after-entities', async () => {
      registry.hasListeners.mockReturnValue(true)
      const loadAfter = vi.fn()
      const args = afterArgs({
        action: 'delete',
        loadAfterMutationEntities: loadAfter,
        beforeMutationEntities: [{ id: '1', title: 'gone' }],
      })

      await plugin.onEntityMutation.afterEntityMutation!(args)

      expect(loadAfter).not.toHaveBeenCalled()
      expect(registry.emit).toHaveBeenCalledExactlyOnceWith('entity.Post.deleted', {
        model: 'Post',
        action: 'deleted',
        before: { id: '1', title: 'gone' },
        after: undefined,
      })
    })

    it('emits nothing when no listener exists', async () => {
      registry.hasListeners.mockReturnValue(false)
      const args = afterArgs()

      await plugin.onEntityMutation.afterEntityMutation!(args)

      expect(registry.emit).not.toHaveBeenCalled()
    })
  })
})
