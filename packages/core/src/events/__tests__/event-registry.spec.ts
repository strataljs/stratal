import { createMock } from '@stratal/testing/mocks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoggerService } from '../../logger'
import { EventRegistry } from '../event-registry'

describe('EventRegistry', () => {
  let registry: EventRegistry

  beforeEach(() => {
    registry = new EventRegistry(
      createMock<ExecutionContext>(),
      createMock<LoggerService>()
    )
  })

  describe('hasListeners', () => {
    it('returns false when no handler is registered', () => {
      expect(registry.hasListeners('entity.Post.updated')).toBe(false)
    })

    it('returns true for an exact-match handler', () => {
      registry.on('entity.Post.updated', vi.fn())
      expect(registry.hasListeners('entity.Post.updated')).toBe(true)
    })

    it('matches model wildcard handlers (entity.Post)', () => {
      registry.on('entity.Post', vi.fn())
      expect(registry.hasListeners('entity.Post.updated')).toBe(true)
    })

    it('matches action wildcard handlers (entity.updated)', () => {
      registry.on('entity.updated', vi.fn())
      expect(registry.hasListeners('entity.Post.updated')).toBe(true)
    })

    it('matches phase wildcard handlers (entity)', () => {
      registry.on('entity', vi.fn())
      expect(registry.hasListeners('entity.Post.updated')).toBe(true)
    })

    it('does not match handlers registered for other models', () => {
      registry.on('entity.User.updated', vi.fn())
      expect(registry.hasListeners('entity.Post.updated')).toBe(false)
    })

    it('returns false after the only handler is removed', () => {
      const handler = vi.fn()
      registry.on('entity.Post.updated', handler)
      registry.off('entity.Post.updated', handler)
      expect(registry.hasListeners('entity.Post.updated')).toBe(false)
    })
  })
})
