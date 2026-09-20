import { describe, expect, it } from 'vitest'
import { ModalBackgroundFetchError } from '../modal-background-fetch.error'

describe('ModalBackgroundFetchError', () => {
  it('carries the registered key and a gateway status', () => {
    // No DI container is available in a unit test, so withI18n falls back to
    // returning the key itself — asserting on the key (not English prose) is
    // what catches the message going back to a hardcoded literal.
    const error = new ModalBackgroundFetchError()

    expect(error.message).toBe('modal.errors.backgroundFetchFailed')
    expect(error.httpStatus).toBe(502)
  })
})
