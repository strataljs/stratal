import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Container } from '../../di/container'
import type { LoggerService } from '../../logger/services/logger.service'
import type { RouterContext } from '../../router/router-context'
import { GuardRejectedError } from '../errors'
import { GuardExecutionService } from '../guard-execution.service'
import type { CanActivate, Guard } from '../types'

describe('GuardExecutionService', () => {
  let service: GuardExecutionService
  let mockLogger: DeepMocked<LoggerService>
  let mockContext: DeepMocked<RouterContext>
  let mockContainer: DeepMocked<Container>

  beforeEach(() => {
    vi.clearAllMocks()

    mockLogger = createMock<LoggerService>()
    mockContext = createMock<RouterContext>()
    mockContainer = createMock<Container>();

    // Setup context mock with nested c.req for logger debug calls
    (mockContext as unknown as { c: { req: { path: string; method: string } } }).c = {
      req: { path: '/test', method: 'GET' },
    }

    service = new GuardExecutionService(mockLogger)
  })

  describe('executeGuards()', () => {
    it('should return true for empty guards array', async () => {
      const result = await service.executeGuards([], mockContext, mockContainer)
      expect(result).toBe(true)
    })

    it('should return true when single guard returns true', async () => {
      const guard: CanActivate = { canActivate: vi.fn().mockResolvedValue(true) }

      const result = await service.executeGuards(
        [guard],
        mockContext,
        mockContainer
      )

      expect(result).toBe(true)
    })

    it('throws GuardRejectedError when a guard returns false', async () => {
      const guard: CanActivate = { canActivate: vi.fn().mockResolvedValue(false) }

      await expect(
        service.executeGuards([guard], mockContext, mockContainer)
      ).rejects.toBeInstanceOf(GuardRejectedError)
    })

    it('names the rejecting guard, so a handler can tell which one denied', async () => {
      class BudgetGuard implements CanActivate {
        canActivate() {
          return false
        }
      }

      await expect(
        service.executeGuards([new BudgetGuard()], mockContext, mockContainer)
      ).rejects.toMatchObject({ guard: 'BudgetGuard' })
    })

    it('carries a 403 status', async () => {
      const guard: CanActivate = { canActivate: vi.fn().mockResolvedValue(false) }

      const error = await service
        .executeGuards([guard], mockContext, mockContainer)
        .catch((e: unknown) => e)

      // `HttpException` exposes `httpStatus`, NOT `status` — see errors/http-exception.ts:21.
      expect((error as GuardRejectedError).httpStatus).toBe(403)
    })

    it("lets a guard's own thrown error through unchanged", async () => {
      // A guard that throws its own HttpException — the common case for an auth guard wanting a
      // 401 rather than a 403 — must not have it replaced by GuardRejectedError.
      const own = new Error('custom')
      const guard: CanActivate = {
        canActivate: vi.fn().mockRejectedValue(own),
      }

      await expect(
        service.executeGuards([guard], mockContext, mockContainer)
      ).rejects.toBe(own)
    })

    it('should return true when multiple guards all return true', async () => {
      const guard1: CanActivate = { canActivate: vi.fn().mockResolvedValue(true) }
      const guard2: CanActivate = { canActivate: vi.fn().mockResolvedValue(true) }

      const result = await service.executeGuards(
        [guard1, guard2] as Guard[],
        mockContext,
        mockContainer
      )

      expect(result).toBe(true)
      expect(guard1.canActivate).toHaveBeenCalled()
      expect(guard2.canActivate).toHaveBeenCalled()
    })

    it('stops at the first rejecting guard', async () => {
      const guard1: CanActivate = { canActivate: vi.fn().mockResolvedValue(false) }
      const guard2: CanActivate = { canActivate: vi.fn().mockResolvedValue(true) }

      await expect(
        service.executeGuards([guard1, guard2] as Guard[], mockContext, mockContainer)
      ).rejects.toBeInstanceOf(GuardRejectedError)
      expect(guard1.canActivate).toHaveBeenCalled()
      expect(guard2.canActivate).not.toHaveBeenCalled()
    })

    it('should use guard instance directly if it has canActivate method', async () => {
      const guard: CanActivate = { canActivate: vi.fn().mockResolvedValue(true) }

      await service.executeGuards([guard], mockContext, mockContainer)

      expect(guard.canActivate).toHaveBeenCalledWith(mockContext)
      expect(mockContainer.resolve).not.toHaveBeenCalled()
    })

    it('should resolve guard class from container', async () => {
      class TestGuard implements CanActivate {
        canActivate = vi.fn().mockResolvedValue(true)
      }

      const guardInstance = new TestGuard()
      mockContainer.resolve.mockReturnValue(guardInstance)

      await service.executeGuards(
        [TestGuard],
        mockContext,
        mockContainer
      )

      expect(mockContainer.resolve).toHaveBeenCalledWith(TestGuard)
      expect(guardInstance.canActivate).toHaveBeenCalledWith(mockContext)
    })

    it('should not treat null as a guard instance', async () => {
      const resolvedGuard = { canActivate: vi.fn().mockResolvedValue(true) }
      mockContainer.resolve.mockReturnValue(resolvedGuard)

      await service.executeGuards(
        [null as any],
        mockContext,
        mockContainer
      )

      // null should be resolved via container, not treated as an instance
      expect(mockContainer.resolve).toHaveBeenCalledWith(null)
      expect(resolvedGuard.canActivate).toHaveBeenCalledWith(mockContext)
    })

    it('should log AnonymousGuard when guard has no constructor name', async () => {
      const guard = Object.create(null) as Record<string, unknown>
      guard.canActivate = vi.fn().mockResolvedValue(false)

      // Capture the rejection rather than swallowing it: a wholly different error would
      // otherwise pass this test as long as the log line happened to match.
      const error = await service
        .executeGuards([guard as unknown as Guard], mockContext, mockContainer)
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(GuardRejectedError)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Guard denied access',
        expect.objectContaining({ guard: 'AnonymousGuard' })
      )
    })

    it('should execute guards in order (first to last)', async () => {
      const order: number[] = []

      const guard1: CanActivate = {
        canActivate: vi.fn().mockImplementation(() => {
          order.push(1)
          return true
        }),
      }
      const guard2: CanActivate = {
        canActivate: vi.fn().mockImplementation(() => {
          order.push(2)
          return true
        }),
      }

      await service.executeGuards(
        [guard1, guard2] as Guard[],
        mockContext,
        mockContainer
      )

      expect(order).toEqual([1, 2])
    })
  })
})
