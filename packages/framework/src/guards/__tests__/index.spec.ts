import { GuardRejectedError as CoreGuardRejectedError } from 'stratal/guards'
import { describe, expect, it } from 'vitest'
import { GuardRejectedError } from '../index'

describe('guards/index re-exports', () => {
  it('re-exports GuardRejectedError as the same class as stratal/guards', () => {
    expect(GuardRejectedError).toBe(CoreGuardRejectedError)
  })
})
