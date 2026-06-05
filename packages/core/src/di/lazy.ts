import type { Constructor } from '../types'

const LAZY_MARKER = Symbol.for('stratal:lazy')

export interface LazyToken<T = unknown> {
  [LAZY_MARKER]: true
  factory: () => Constructor<T>
}

export function lazy<T>(factory: () => Constructor<T>): LazyToken<T> {
  return { [LAZY_MARKER]: true, factory } as LazyToken<T>
}

export function isLazyToken(value: unknown): value is LazyToken {
  return typeof value === 'object' && value !== null && LAZY_MARKER in value
}
