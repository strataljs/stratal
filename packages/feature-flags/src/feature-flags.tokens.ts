/**
 * DI tokens for the feature-flags module.
 *
 * Use `Symbol.for(...)` so the tokens resolve to the same symbol across module
 * boundaries (the global symbol registry).
 */
export const FEATURE_FLAG_TOKENS = {
  /** The resolved {@link FeatureFlagModuleOptions}. */
  Options: Symbol.for('stratal:feature-flags:options'),
  /** The request-scoped {@link FeatureFlagService} bound to the default app. */
  FeatureFlagService: Symbol.for('stratal:feature-flags:service'),
} as const

export type FeatureFlagToken = (typeof FEATURE_FLAG_TOKENS)[keyof typeof FEATURE_FLAG_TOKENS]
