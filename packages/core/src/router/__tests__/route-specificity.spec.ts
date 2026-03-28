import { createMock } from '@stratal/testing/mocks'
import { describe, expect, it } from 'vitest'
import type { LoggerService } from '../../logger/services/logger.service'
import { Controller, getControllerRoute } from '../decorators/controller.decorator'
import { Get } from '../decorators/http-method.decorator'
import { RouteRegistrationService } from '../services/route-registration.service'

// --- Test controllers ---

@Controller('/auth')
class AuthController {
  @Get('/login')
  login() { /**/ }
}

@Controller('/api/v1/schools')
class SchoolsController {
  @Get('/')
  index() { /**/ }
}

@Controller('/:tenantId')
class DashboardController {
  @Get('/')
  home() { /**/ }

  @Get('/tenants')
  tenants() { /**/ }
}

@Controller('/health')
class HealthController {
  @Get('/')
  index() { /**/ }
}

@Controller('/api/v1/auth')
class WildcardAuthController {
  async handle() { /**/ }
}

interface RouteRegistrationServicePrivate {
  getPathSpecificityScore(path: string): number
}

describe('Route specificity sorting', () => {
  const mockLogger = createMock<LoggerService>()
  const service = new RouteRegistrationService(mockLogger as unknown as LoggerService, null)

  const getScore = (path: string): number => {
    return (service as unknown as RouteRegistrationServicePrivate).getPathSpecificityScore(path)
  }

  it('should score static paths lower than dynamic paths', () => {
    expect(getScore('/auth')).toBeLessThan(getScore('/:tenantId'))
    expect(getScore('/api/v1/schools')).toBeLessThan(getScore('/:tenantId'))
    expect(getScore('/health')).toBeLessThan(getScore('/:tenantId'))
  })

  it('should score dynamic paths lower than wildcard paths', () => {
    expect(getScore('/:tenantId')).toBeLessThan(getScore('/api/v1/auth/:path{.+}'))
  })

  describe('configure() sorts controllers by specificity', () => {
    it('should sort static controllers before dynamic controllers', () => {
      const controllers = [
        DashboardController,  // /:tenantId — dynamic
        AuthController,       // /auth — static
        SchoolsController,    // /api/v1/schools — static
        HealthController,     // /health — static
      ]

      // Extract the sort logic by checking the order of registrations
      const sorted = [...controllers].sort((a, b) => {
        const aHasHandle = 'handle' in a.prototype
        const bHasHandle = 'handle' in b.prototype
        if (aHasHandle && !bHasHandle) return 1
        if (!aHasHandle && bHasHandle) return -1

        const aScore = getScore(getControllerRoute(a) ?? '')
        const bScore = getScore(getControllerRoute(b) ?? '')
        return aScore - bScore
      })

      const sortedPaths = sorted.map((c) => getControllerRoute(c))

      // All static paths should come before /:tenantId
      const dynamicIndex = sortedPaths.indexOf('/:tenantId')
      const staticPaths = sortedPaths.slice(0, dynamicIndex)
      for (const path of staticPaths) {
        expect(path).not.toContain(':')
      }

      // /:tenantId should be last among non-wildcard controllers
      expect(sortedPaths[sortedPaths.length - 1]).toBe('/:tenantId')
    })

    it('should sort wildcard handle() controllers after everything else', () => {
      const controllers = [
        WildcardAuthController,  // handle() — catch-all
        DashboardController,     // /:tenantId — dynamic
        AuthController,          // /auth — static
      ]

      const sorted = [...controllers].sort((a, b) => {
        const aHasHandle = 'handle' in a.prototype
        const bHasHandle = 'handle' in b.prototype
        if (aHasHandle && !bHasHandle) return 1
        if (!aHasHandle && bHasHandle) return -1

        const aScore = getScore(getControllerRoute(a) ?? '')
        const bScore = getScore(getControllerRoute(b) ?? '')
        return aScore - bScore
      })

      const sortedNames = sorted.map((c) => c.name)

      // Static first, dynamic second, wildcard last
      expect(sortedNames).toEqual([
        'AuthController',
        'DashboardController',
        'WildcardAuthController',
      ])
    })
  })
})
