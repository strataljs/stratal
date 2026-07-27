import { describe, expect, it } from 'vitest'
import type { EntrypointNameFrom } from '../types'

/**
 * Type-level coverage for {@link EntrypointNameFrom}, the derivation behind
 * `gateway.entrypoint`'s type. These assertions are checked by `tsc --noEmit`
 * (the package `typecheck` script), not at runtime — the single runtime `it`
 * exists only so Vitest does not report an empty suite.
 *
 * The generic form is tested here rather than `CachedEntrypointName` directly
 * because the ambient `Cloudflare.Exports` in this repo's own compilation is
 * empty (no consumer has run `wrangler types`), so `CachedEntrypointName`
 * resolves to `string` in-repo. Feeding the exports map in as a type parameter
 * proves the behaviour a consumer's generated types would exercise.
 */

// Invariant equality: `Equal<A, B>` is `true` only when A and B are mutually
// assignable, so a union that is merely wider/narrower does not pass.
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

type _assertions = [
  // A single named export is offered as a string-literal union.
  Expect<Equal<EntrypointNameFrom<{ default: unknown; Cached: unknown }>, 'Cached'>>,
  // Every non-default named export is offered.
  Expect<Equal<EntrypointNameFrom<{ Cached: unknown; Backend: unknown }>, 'Cached' | 'Backend'>>,
  // `'default'` is never a valid cached entrypoint — the boot check rejects it.
  Expect<Equal<EntrypointNameFrom<{ default: unknown }>, string>>,
  // No generated types (empty exports) degrades to `string`, blocking nobody.
  Expect<Equal<EntrypointNameFrom<Record<string, never>>, string>>,
  // Non-string keys are dropped.
  Expect<Equal<EntrypointNameFrom<{ Cached: unknown; 0: unknown }>, 'Cached'>>,
]

describe('EntrypointNameFrom', () => {
  it('is verified at the type level (see the assertions above)', () => {
    // A failing `Expect<...>` above is a compile error, which fails `typecheck`.
    expect(true).toBe(true)
  })
})
