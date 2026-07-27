import { describe, expect, it } from 'vitest'
import type { Middleware } from 'stratal/router'
import { AUTH_GATEWAY_PRIMERS } from '../auth.primers'
import { SessionVerificationMiddleware } from '../middleware/session-verification.middleware'

// Type-level test: verify AUTH_GATEWAY_PRIMERS satisfies ResponseCacheModuleOptions['primers']
// Spread, because the export is a `readonly` tuple — the point of the check is
// that its *elements* are valid `ResponseCacheModuleOptions['primers']` entries.
const _typeCheck: (new (...args: never[]) => Middleware)[] = [...AUTH_GATEWAY_PRIMERS]

describe('AUTH_GATEWAY_PRIMERS', () => {
  it('exposes session verification so ctx.user() resolves in the gateway', () => {
    expect(AUTH_GATEWAY_PRIMERS).toContain(SessionVerificationMiddleware)
  })
})
