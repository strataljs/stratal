/**
 * Queue Binding Type System
 *
 * Derives the union of valid queue binding identifiers from the application's
 * augmented `StratalEnv`. Apps augment `StratalEnv` (typically via their own
 * `env.d.ts` that extends `Cloudflare.Env`); Stratal extracts the string keys
 * whose value type is `Queue` and exposes them as the `QueueBinding` union.
 *
 * @example In your app's env.d.ts:
 * ```typescript
 * declare module 'stratal' {
 *   interface StratalEnv extends Cloudflare.Env {}
 * }
 * ```
 *
 * Then everywhere — `@InjectQueue('BACKGROUND_QUEUE')`, `QueueModule.registerQueue('BACKGROUND_QUEUE')` —
 * the string is type-checked against the actual binding names declared in wrangler.jsonc.
 */

import type { StratalEnv } from '../env'

/**
 * String keys of `StratalEnv` whose value type is `Queue`.
 */
type QueueBindingFromEnv = Extract<
  { [K in keyof StratalEnv]: StratalEnv[K] extends Queue ? K : never }[keyof StratalEnv],
  string
>

/**
 * Type-safe queue binding identifier.
 *
 * Resolves to the union of `Queue`-typed binding keys on the augmented
 * `StratalEnv`. Falls back to `string` when no `Queue` bindings are visible
 * (e.g. library code compiled outside an app's env context).
 */
export type QueueBinding = [QueueBindingFromEnv] extends [never]
  ? string
  : QueueBindingFromEnv
