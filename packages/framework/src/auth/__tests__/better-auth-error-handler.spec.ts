import { APIError } from 'better-auth/api'
import { describe, expect, it } from 'vitest'
import { FreshSessionRequiredError, SessionExpiredError } from '../errors'
import { mapBetterAuthError } from '../utils/better-auth-error-handler'

describe('mapBetterAuthError', () => {
  it('maps SESSION_NOT_FRESH to FreshSessionRequiredError', () => {
    const error = new APIError('FORBIDDEN', { code: 'SESSION_NOT_FRESH', message: 'Session is not fresh' })

    const mapped = mapBetterAuthError(error)

    expect(mapped).toBeInstanceOf(FreshSessionRequiredError)
    expect((mapped as FreshSessionRequiredError).httpStatus).toBe(403)
  })

  it('maps SESSION_EXPIRED to SessionExpiredError', () => {
    const error = new APIError('UNAUTHORIZED', { code: 'SESSION_EXPIRED', message: 'Session expired' })

    const mapped = mapBetterAuthError(error)

    expect(mapped).toBeInstanceOf(SessionExpiredError)
    expect((mapped as SessionExpiredError).httpStatus).toBe(401)
  })
})
