import { AsyncLocalStorage } from 'node:async_hooks'
import { isDisposable } from 'stratal/di'
import { describe, expect, it, vi } from 'vitest'
import { makeReentrantTransaction } from '../database.helpers'

function createFakeClient() {
  return {
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn(),
  }
}

describe('makeReentrantTransaction (disposal)', () => {
  it('exposes Symbol.asyncDispose that disconnects the underlying client', async () => {
    const client = createFakeClient()
    const proxied = makeReentrantTransaction(client, new AsyncLocalStorage())

    await (proxied as unknown as AsyncDisposable)[Symbol.asyncDispose]()

    expect(client.$disconnect).toHaveBeenCalledOnce()
  })

  it('satisfies the stratal Disposable contract so container disposal reaches it', () => {
    const proxied = makeReentrantTransaction(createFakeClient(), new AsyncLocalStorage())

    expect(isDisposable(proxied)).toBe(true)
  })
})
