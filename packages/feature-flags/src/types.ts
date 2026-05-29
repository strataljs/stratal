import type { StratalEnv } from 'stratal'
import type { RouterContext } from 'stratal/router'

/**
 * A value a feature flag can resolve to.
 *
 * @see https://developers.cloudflare.com/flagship/binding/methods/
 */
export type FlagValue = boolean | string | number | object

/**
 * String keys of the augmented `StratalEnv` whose value is a Flagship binding.
 */
type FlagshipBindingFromEnv = Extract<
  { [K in keyof StratalEnv]: StratalEnv[K] extends Flagship ? K : never }[keyof StratalEnv],
  string
>

/**
 * Type-safe Flagship binding name.
 *
 * Resolves to the union of `Flagship`-typed binding keys on the augmented
 * `StratalEnv`. Falls back to `string` when no Flagship bindings are visible
 * (for example library code compiled outside an app's env context).
 */
export type FlagshipBindingName = [FlagshipBindingFromEnv] extends [never]
  ? string
  : FlagshipBindingFromEnv

/**
 * Augment this interface to get typed flag keys for `useFlag()` and the service.
 *
 * @example
 * ```typescript
 * declare module '@stratal/feature-flags' {
 *   interface FeatureFlagRegistry {
 *     'new-checkout': boolean
 *     'checkout-flow': string
 *   }
 * }
 * ```
 */
export interface FeatureFlagRegistry {}

/**
 * A declared set of flags and their default values.
 *
 * Flagship has no enumeration API, so the flags you intend to evaluate (and
 * share to the frontend) must be declared once here. The default also
 * doubles as the type hint used to pick the evaluation method in `all()`.
 */
export type FlagManifest = Record<string, FlagValue>

/**
 * A single Flagship app bound to the Worker.
 */
export interface FeatureFlagApp {
  /** Flagship binding name from your Wrangler config (type-checked against `StratalEnv`). */
  binding: FlagshipBindingName
  /** Declared flags + defaults for this app. Used for manifest defaults and Inertia sharing. */
  flags?: FlagManifest
}

/**
 * Feature-flags module configuration.
 */
export interface FeatureFlagModuleOptions {
  /** One or more Flagship apps. A Worker may bind to multiple apps. */
  apps: FeatureFlagApp[]
  /** Default app binding used by the injected `FeatureFlagService`. Defaults to `apps[0].binding`. */
  default?: FlagshipBindingName
  /**
   * Resolves a per-request evaluation context (for example `{ userId }`) merged
   * into every evaluation. Per-call context passed to a method overrides these.
   * Receives the current request context; skipped outside request scope.
   */
  context?: (ctx: RouterContext) => FlagshipEvaluationContext | Promise<FlagshipEvaluationContext>
}
