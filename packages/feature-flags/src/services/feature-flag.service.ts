import type { StratalEnv } from 'stratal'
import { DI_TOKENS, Transient, inject } from 'stratal/di'
import { LOGGER_TOKENS, type LoggerService } from 'stratal/logger'
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
 * Switch to another Flagship app with {@link use}. Evaluation never throws —
 * the binding returns the default value on evaluation errors, and the service
 * catches everything else (e.g. a dropped remote-binding tunnel in local dev)
 * and returns the same fallback, logging a warning.
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
@Transient(FEATURE_FLAG_TOKENS.FeatureFlagService)
export class FeatureFlagService {
  private readonly apps = new Map<string, FeatureFlagApp>()
  private bindingName!: string
  private binding!: Flagship
  private manifest!: FlagManifest

  constructor(
    @inject(FEATURE_FLAG_TOKENS.Options) private readonly options: FeatureFlagModuleOptions,
    @inject(DI_TOKENS.CloudflareEnv) private readonly env: StratalEnv,
    @inject(ROUTER_TOKENS.RouterContext, { isOptional: true }) private readonly routerContext: RouterContext | undefined,
    @inject(LOGGER_TOKENS.LoggerService, { isOptional: true }) private readonly logger: LoggerService | undefined,
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
    return new FeatureFlagService(this.options, this.env, this.routerContext, this.logger, binding)
  }

  /** The binding name this instance currently targets. */
  get app(): string {
    return this.bindingName
  }

  // ==================== EVALUATION ====================

  /** Returns the raw flag value without type checking. */
  async get(flagKey: string, defaultValue?: unknown, context?: FlagshipEvaluationContext): Promise<unknown> {
    const fallback = this.fallback(flagKey, defaultValue)
    return this.safe(flagKey, async () => this.binding.get(flagKey, fallback, await this.context(context)), () => fallback)
  }

  /** Returns the flag value as a `boolean`. */
  async getBooleanValue(flagKey: string, defaultValue?: boolean, context?: FlagshipEvaluationContext): Promise<boolean> {
    const fallback = this.fallback(flagKey, defaultValue, false)
    return this.safe(flagKey, async () => this.binding.getBooleanValue(flagKey, fallback, await this.context(context)), () => fallback)
  }

  /** Returns the flag value as a `string`. */
  async getStringValue(flagKey: string, defaultValue?: string, context?: FlagshipEvaluationContext): Promise<string> {
    const fallback = this.fallback(flagKey, defaultValue, '')
    return this.safe(flagKey, async () => this.binding.getStringValue(flagKey, fallback, await this.context(context)), () => fallback)
  }

  /** Returns the flag value as a `number`. */
  async getNumberValue(flagKey: string, defaultValue?: number, context?: FlagshipEvaluationContext): Promise<number> {
    const fallback = this.fallback(flagKey, defaultValue, 0)
    return this.safe(flagKey, async () => this.binding.getNumberValue(flagKey, fallback, await this.context(context)), () => fallback)
  }

  /** Returns the flag value as a typed object. */
  async getObjectValue<T extends object>(flagKey: string, defaultValue?: T, context?: FlagshipEvaluationContext): Promise<T> {
    const fallback = this.fallback(flagKey, defaultValue, {} as T)
    return this.safe(flagKey, async () => this.binding.getObjectValue<T>(flagKey, fallback, await this.context(context)), () => fallback)
  }

  /** Returns the `boolean` flag value with evaluation metadata. */
  async getBooleanDetails(flagKey: string, defaultValue?: boolean, context?: FlagshipEvaluationContext): Promise<FlagshipEvaluationDetails<boolean>> {
    const fallback = this.fallback(flagKey, defaultValue, false)
    return this.safe(flagKey, async () => this.binding.getBooleanDetails(flagKey, fallback, await this.context(context)), (error) => this.errorDetails(flagKey, fallback, error))
  }

  /** Returns the `string` flag value with evaluation metadata. */
  async getStringDetails(flagKey: string, defaultValue?: string, context?: FlagshipEvaluationContext): Promise<FlagshipEvaluationDetails<string>> {
    const fallback = this.fallback(flagKey, defaultValue, '')
    return this.safe(flagKey, async () => this.binding.getStringDetails(flagKey, fallback, await this.context(context)), (error) => this.errorDetails(flagKey, fallback, error))
  }

  /** Returns the `number` flag value with evaluation metadata. */
  async getNumberDetails(flagKey: string, defaultValue?: number, context?: FlagshipEvaluationContext): Promise<FlagshipEvaluationDetails<number>> {
    const fallback = this.fallback(flagKey, defaultValue, 0)
    return this.safe(flagKey, async () => this.binding.getNumberDetails(flagKey, fallback, await this.context(context)), (error) => this.errorDetails(flagKey, fallback, error))
  }

  /** Returns the typed object flag value with evaluation metadata. */
  async getObjectDetails<T extends object>(flagKey: string, defaultValue?: T, context?: FlagshipEvaluationContext): Promise<FlagshipEvaluationDetails<T>> {
    const fallback = this.fallback(flagKey, defaultValue, {} as T)
    return this.safe(flagKey, async () => this.binding.getObjectDetails<T>(flagKey, fallback, await this.context(context)), (error) => this.errorDetails(flagKey, fallback, error))
  }

  /**
   * Evaluates every flag declared in the current app's manifest and returns a
   * `{ key: value }` map. The evaluation method is chosen from each declared
   * default's type. Powers `FeatureFlagShareMiddleware`.
   */
  async all(context?: FlagshipEvaluationContext): Promise<Record<string, FlagValue>> {
    const keys = Object.keys(this.manifest)
    // Resolve the shared context once. A throwing resolver must not take the
    // batch down — fall back to the manifest defaults, the same values each
    // per-flag method returns when evaluation can't proceed.
    let merged: FlagshipEvaluationContext | undefined
    try {
      merged = await this.context(context)
    } catch (error) {
      this.logger?.warn(`Feature flag context resolution failed on app "${this.bindingName}"; returning manifest defaults.`, { error: this.message(error) })
      return { ...this.manifest }
    }
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
        return this.safe(flagKey, () => this.binding.getBooleanValue(flagKey, declared, context), () => declared)
      case 'number':
        return this.safe(flagKey, () => this.binding.getNumberValue(flagKey, declared, context), () => declared)
      case 'string':
        return this.safe(flagKey, () => this.binding.getStringValue(flagKey, declared, context), () => declared)
      default:
        return this.safe(flagKey, () => this.binding.getObjectValue(flagKey, declared, context), () => declared)
    }
  }

  /**
   * Runs an evaluation and absorbs any failure into the fallback. The binding
   * already returns the default on evaluation errors, but the call itself can
   * still reject — e.g. when a `remote: true` binding's dev-proxy WebSocket
   * tunnel drops. A flag lookup must never take the request down with it.
   */
  private async safe<T>(flagKey: string, evaluate: () => Promise<T>, onError: (error: unknown) => T): Promise<T> {
    try {
      return await evaluate()
    } catch (error) {
      this.logger?.warn(`Feature flag evaluation failed for "${flagKey}" on app "${this.bindingName}"; returning the fallback value.`, {
        error: this.message(error),
      })
      return onError(error)
    }
  }

  /** Synthesizes the details shape the binding would return for a failed evaluation. */
  private errorDetails<T>(flagKey: string, value: T, error: unknown): FlagshipEvaluationDetails<T> {
    return { flagKey, value, reason: 'ERROR', errorMessage: this.message(error) }
  }

  /** Extracts a human-readable message from an unknown thrown value. */
  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
