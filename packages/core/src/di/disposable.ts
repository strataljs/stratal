/**
 * Disposal contract for container-managed instances.
 *
 * Singletons (and request-cached instances) that hold live resources —
 * timers, sockets, connection pools, event subscriptions — implement one of
 * these hooks so {@link Container.dispose} can release them on shutdown
 * (e.g. when a Vite HMR reload replaces the running Application).
 *
 * Precedence when multiple hooks are present: `Symbol.asyncDispose`,
 * then `Symbol.dispose`, then `dispose()`.
 */
export interface Disposable {
  dispose?(): void | Promise<void>
  [Symbol.dispose]?(): void
  [Symbol.asyncDispose]?(): PromiseLike<void>
}

export function isDisposable(instance: unknown): instance is Disposable {
  if (typeof instance !== 'object' || instance === null) return false
  const candidate = instance as Disposable
  return typeof candidate[Symbol.asyncDispose] === 'function'
    || typeof candidate[Symbol.dispose] === 'function'
    || typeof candidate.dispose === 'function'
}

/** Invoke the instance's dispose hook, preferring async > sync > method form. */
export async function disposeInstance(instance: Disposable): Promise<void> {
  const asyncDispose = instance[Symbol.asyncDispose]
  if (typeof asyncDispose === 'function') {
    await asyncDispose.call(instance)
    return
  }
  const syncDispose = instance[Symbol.dispose]
  if (typeof syncDispose === 'function') {
    syncDispose.call(instance)
    return
  }
  await instance.dispose?.()
}
