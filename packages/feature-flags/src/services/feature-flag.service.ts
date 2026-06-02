import type { StratalEnv } from 'stratal'
import { DI_TOKENS, Request, inject } from 'stratal/di'
import { ROUTER_TOKENS, type RouterContext } from 'stratal/router'
import { FeatureFlagError } from '../feature-flags.error'
import { FEATURE_FLAG_TOKENS } from '../feature-flags.tokens'
import type {
  FeatureFlagApp,
  FeatureFlagModuleOptions,
  FlagManifest,
  FlagValue,
  FlagshipBindingName,
} from '../types'

/**
 * Feature Flag Service
 *
 * Type-safe wrapper around a Cloudflare Flagship binding (`env.FLAGS`). Mirrors
 * the binding's evaluation methods 1:1, with two ergonomic additions:
 *
 * - **Manifest defaults** — when you omit a default, the value declared in the
 *   app's `flags` manifest is used (an explicit argument always wins).
 * - **Default context** — the module's `context` resolver is merged into every
 *   evaluation (per-call context overrides it). Resolved from the current
 *   request; skipped automatically outside request scope.
 *
 * Switch to another Flagship app with {@link use}. Evaluation never throws — the
 * binding returns the default value on error.
 *
 * @example
 * ```typescript
 * @inject(FEATURE_FLAG_TOKENS.FeatureFlagService)
 * private readonly flags: FeatureFlagService
 *
 * const enabled = await this.flags.getBooleanValue('new-checkout')        // manifest default
 * const layout  = await this.flags.use('EXPERIMENT_FLAGS').getStringValue('layout', 'v1')
 * ```
 *
 * @see https://developers.cloudflare.com/flagship/binding/
 */
@Request(FEATURE_FLAG_TOKENS.FeatureFlagService)
export class FeatureFlagService {
  private readonly apps = new Map<string, FeatureFlagApp>()
  private bindingName!: string
  private binding!: Flagship
  private manifest!: FlagManifest

  constructor(
    @inject(FEATURE_FLAG_TOKENS.Options) private readonly options: FeatureFlagModuleOptions,
    @inject(DI_TOKENS.CloudflareEnv) private readonly env: StratalEnv,
    @inject(ROUTER_TOKENS.RouterContext) private readonly routerContext: RouterContext | null,
    // Only passed by `use()`; DI never injects it. Lets `use()` bind exactly once
    // instead of binding to the default in the constructor and re-binding after.
    initialBinding?: string,
  ) {
    for (const app of options.apps) {
      this.apps.set(app.binding, app)
    }
    this.bindTo(initialBinding ?? options.default ?? options.apps[0]?.binding)
  }

  /**
   * Switch to a different configured Flagship app.
   *
   * Returns a new immutable instance bound to `binding`; the original is
   * unchanged. The binding must be declared in the module's `apps`.
   */
  use(binding: FlagshipBindingName): FeatureFlagService {
    if (binding === this.bindingName) return this
    return new FeatureFlagService(this.options, this.env, this.routerContext, binding)
  }

  /** The binding name this instance currently targets. */
  get app(): string {
    return this.bindingName
  }

  // ==================== EVALUATION ====================

  /** Returns the raw flag value without type checking. */
  async get(flagKey: string, defaultValue?: unknown, context?: FlagshipEvaluationContext): Promise<unknown> {
    return this.binding.get(flagKey, this.fallback(flagKey, defaultValue), await this.context(context))
  }

  /** Returns the flag value as a `boolean`. */
  async getBooleanValue(flagKey: string, defaultValue?: boolean, context?: FlagshipEvaluationContext): Promise<boolean> {
    return this.binding.getBooleanValue(flagKey, this.fallback(flagKey, defaultValue, false), await this.context(context))
  }

  /** Returns the flag value as a `string`. */
  async getStringValue(flagKey: string, defaultValue?: string, context?: FlagshipEvaluationContext): Promise<string> {
    return this.binding.getStringValue(flagKey, this.fallback(flagKey, defaultValue, ''), await this.context(context))
  }

  /** Returns the flag value as a `number`. */
  async getNumberValue(flagKey: string, defaultValue?: number, context?: FlagshipEvaluationContext): Promise<number> {
    return this.binding.getNumberValue(flagKey, this.fallback(flagKey, defaultValue, 0), await this.context(context))
  }

  /** Returns the flag value as a typed object. */
  async getObjectValue<T extends object>(flagKey: string, defaultValue?: T, context?: FlagshipEvaluationContext): Promise<T> {
    return this.binding.getObjectValue<T>(flagKey, this.fallback(flagKey, defaultValue, {} as T), await this.context(context))
  }

  /** Returns the `boolean` flag value with evaluation metadata. */
  async getBooleanDetails(flagKey: string, defaultValue?: boolean, context?: FlagshipEvaluationContext): Promise<FlagshipEvaluationDetails<boolean>> {
    return this.binding.getBooleanDetails(flagKey, this.fallback(flagKey, defaultValue, false), await this.context(context))
  }

  /** Returns the `string` flag value with evaluation metadata. */
  async getStringDetails(flagKey: string, defaultValue?: string, context?: FlagshipEvaluationContext): Promise<FlagshipEvaluationDetails<string>> {
    return this.binding.getStringDetails(flagKey, this.fallback(flagKey, defaultValue, ''), await this.context(context))
  }

  /** Returns the `number` flag value with evaluation metadata. */
  async getNumberDetails(flagKey: string, defaultValue?: number, context?: FlagshipEvaluationContext): Promise<FlagshipEvaluationDetails<number>> {
    return this.binding.getNumberDetails(flagKey, this.fallback(flagKey, defaultValue, 0), await this.context(context))
  }

  /** Returns the typed object flag value with evaluation metadata. */
  async getObjectDetails<T extends object>(flagKey: string, defaultValue?: T, context?: FlagshipEvaluationContext): Promise<FlagshipEvaluationDetails<T>> {
    return this.binding.getObjectDetails<T>(flagKey, this.fallback(flagKey, defaultValue, {} as T), await this.context(context))
  }

  /**
   * Evaluates every flag declared in the current app's manifest and returns a
   * `{ key: value }` map. The evaluation method is chosen from each declared
   * default's type. Powers `FeatureFlagShareMiddleware`.
   */
  async all(context?: FlagshipEvaluationContext): Promise<Record<string, FlagValue>> {
    const merged = await this.context(context)
    const keys = Object.keys(this.manifest)
    const values = await Promise.all(keys.map((key) => this.evaluate(key, this.manifest[key], merged)))
    const result: Record<string, FlagValue> = {}
    keys.forEach((key, i) => {
      result[key] = values[i]
    })
    return result
  }

  // ==================== INTERNAL ====================

  private bindTo(name: string | undefined): void {
    if (!name) {
      throw new FeatureFlagError('No feature flag apps configured. Provide at least one app in FeatureFlagModule.forRoot({ apps: [...] }).')
    }
    const app = this.apps.get(name)
    if (!app) {
      throw new FeatureFlagError(`Feature flag app "${name}" is not configured.`)
    }
    const binding = (this.env as unknown as Record<string, unknown>)[name] as Flagship | undefined
    if (!binding) {
      throw new FeatureFlagError(`Flagship binding "${name}" was not found in the environment.`)
    }
    this.bindingName = name
    this.binding = binding
    this.manifest = app.flags ?? {}
  }

  /** Resolves the merged evaluation context (default context + per-call override). */
  private async context(callContext?: FlagshipEvaluationContext): Promise<FlagshipEvaluationContext | undefined> {
    if (!this.options.context || !this.routerContext) return callContext
    const base = await this.options.context(this.routerContext)
    return callContext ? { ...base, ...callContext } : base
  }

  /** Picks the default: explicit arg, then manifest, then the type's zero value. */
  private fallback<T>(flagKey: string, provided: T | undefined, zero?: T): T {
    if (provided !== undefined) return provided
    if (flagKey in this.manifest) return this.manifest[flagKey] as T
    return zero as T
  }

  /** Evaluates a single flag, choosing the method from the declared default's type. */
  private evaluate(flagKey: string, declared: FlagValue, context?: FlagshipEvaluationContext): Promise<FlagValue> {
    switch (typeof declared) {
      case 'boolean':
        return this.binding.getBooleanValue(flagKey, declared, context)
      case 'number':
        return this.binding.getNumberValue(flagKey, declared, context)
      case 'string':
        return this.binding.getStringValue(flagKey, declared, context)
      default:
        return this.binding.getObjectValue(flagKey, declared, context)
    }
  }
}
