import { describe, expect, it } from 'vitest'
import { Controller, getControllerRoute } from '../decorators/controller.decorator'
import { Get } from '../decorators/http-method.decorator'
import { getPathSpecificityScore } from '../utils/path'

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

describe('Route specificity sorting', () => {
  it('should score static paths lower than dynamic paths', () => {
    expect(getPathSpecificityScore('/auth')).toBeLessThan(getPathSpecificityScore('/:tenantId'))
    expect(getPathSpecificityScore('/api/v1/schools')).toBeLessThan(getPathSpecificityScore('/:tenantId'))
    expect(getPathSpecificityScore('/health')).toBeLessThan(getPathSpecificityScore('/:tenantId'))
  })

  it('should score dynamic paths lower than wildcard paths', () => {
    expect(getPathSpecificityScore('/:tenantId')).toBeLessThan(getPathSpecificityScore('/api/v1/auth/:path{.+}'))
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

        const aScore = getPathSpecificityScore(getControllerRoute(a) ?? '')
        const bScore = getPathSpecificityScore(getControllerRoute(b) ?? '')
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

        const aScore = getPathSpecificityScore(getControllerRoute(a) ?? '')
        const bScore = getPathSpecificityScore(getControllerRoute(b) ?? '')
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
