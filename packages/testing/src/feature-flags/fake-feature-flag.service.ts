import { Singleton } from 'stratal/di';

/**
 * Global DI token for the feature-flags service.
 *
 * Mirrors `FEATURE_FLAG_TOKENS.FeatureFlagService` from `@stratal/feature-flags`
 * — `Symbol.for(...)` resolves to the same symbol across packages via the global
 * registry. Declared here so `@stratal/testing` needs no dependency on the
 * optional feature-flags package. Keep this string in sync with
 * `packages/feature-flags/src/feature-flags.tokens.ts`.
 */
export const FEATURE_FLAG_SERVICE_TOKEN = Symbol.for('stratal:feature-flags:service')

/** A value a feature flag can resolve to. */
export type FlagValue = boolean | string | number | object

interface FakeFlagDetails<T> {
  flagKey: string
  value: T
  reason: string
}

/**
 * FakeFeatureFlagService
 *
 * In-memory stand-in for `@stratal/feature-flags`'s request-scoped
 * `FeatureFlagService`, auto-registered by the testing module so feature-gated
 * code resolves without a real Cloudflare Flagship binding (which only exists at
 * runtime). Mirrors the real service's public evaluation surface.
 *
 * Unset flags return the per-call default (or the type's zero value). Configure
 * values with {@link set} / {@link setAll}; access it in tests via
 * `module.featureFlags`.
 *
 * @example
 * ```typescript
 * module.featureFlags.set('new-checkout', true)
 * const enabled = await flags.getBooleanValue('new-checkout') // true
 * ```
 */
@Singleton(FEATURE_FLAG_SERVICE_TOKEN)
export class FakeFeatureFlagService {
  private readonly flags = new Map<string, FlagValue>()

  // ==================== CONFIGURATION ====================

  /** Set a single flag value. */
  set(flagKey: string, value: FlagValue): this {
    this.flags.set(flagKey, value)
    return this
  }

  /** Replace all configured flags with the given map. */
  setAll(flags: Record<string, FlagValue>): this {
    this.reset()
    for (const [key, value] of Object.entries(flags)) this.flags.set(key, value)
    return this
  }

  /** Clear every configured flag. */
  reset(): this {
    this.flags.clear()
    return this
  }

  // ==================== EVALUATION ====================

  async get(flagKey: string, defaultValue?: unknown): Promise<unknown> {
    return Promise.resolve(this.flags.has(flagKey) ? this.flags.get(flagKey) : defaultValue)
  }

  async getBooleanValue(flagKey: string, defaultValue = false): Promise<boolean> {
    return this.resolve(flagKey, defaultValue)
  }

  async getStringValue(flagKey: string, defaultValue = ''): Promise<string> {
    return this.resolve(flagKey, defaultValue)
  }

  async getNumberValue(flagKey: string, defaultValue = 0): Promise<number> {
    return this.resolve(flagKey, defaultValue)
  }

  async getObjectValue<T extends object>(flagKey: string, defaultValue: T = {} as T): Promise<T> {
    return this.resolve(flagKey, defaultValue)
  }

  async getBooleanDetails(flagKey: string, defaultValue = false): Promise<FakeFlagDetails<boolean>> {
    return this.details(flagKey, await this.getBooleanValue(flagKey, defaultValue))
  }

  async getStringDetails(flagKey: string, defaultValue = ''): Promise<FakeFlagDetails<string>> {
    return this.details(flagKey, await this.getStringValue(flagKey, defaultValue))
  }

  async getNumberDetails(flagKey: string, defaultValue = 0): Promise<FakeFlagDetails<number>> {
    return this.details(flagKey, await this.getNumberValue(flagKey, defaultValue))
  }

  async getObjectDetails<T extends object>(flagKey: string, defaultValue: T = {} as T): Promise<FakeFlagDetails<T>> {
    return this.details(flagKey, await this.getObjectValue(flagKey, defaultValue))
  }

  /** Returns every configured flag as a `{ key: value }` map. */
  async all(): Promise<Record<string, FlagValue>> {
    return Promise.resolve(Object.fromEntries(this.flags))
  }

  /** Switching Flagship apps is a no-op in the fake. */
  use(): this {
    return this
  }

  /** The binding name this instance targets. */
  // oxlint-disable-next-line typescript/class-literal-property-style
  get app(): string {
    return 'fake'
  }

  // ==================== INTERNAL ====================

  private resolve<T extends FlagValue>(flagKey: string, defaultValue: T): Promise<T> {
    return Promise.resolve(this.flags.has(flagKey) ? (this.flags.get(flagKey) as T) : defaultValue)
  }

  private details<T>(flagKey: string, value: T): FakeFlagDetails<T> {
    return { flagKey, value, reason: 'fake' }
  }
}
