import type { MacroFunction } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor = abstract new (...args: any[]) => any

/**
 * Abstract base class for adding macros, instance properties, and getters
 * to classes at runtime.
 *
 * Inspired by [@poppinss/macroable](https://github.com/poppinss/macroable)
 * and Laravel's Macroable trait.
 *
 * @example
 * ```typescript
 * // Register a macro
 * RouterContext.macro('flash', function (this: RouterContext, key: string, value: unknown) {
 *   const session = this.getContainer().resolve(SessionService)
 *   session.flash(key, value)
 * })
 *
 * // Register a getter
 * RouterContext.getter('requestId', function (this: RouterContext) {
 *   return this.header('x-request-id') ?? crypto.randomUUID()
 * }, true)
 *
 * // Register a per-instance property (safe for destructuring)
 * RouterContext.instanceProperty('getUser', function (this: RouterContext) {
 *   return this.getContainer().resolve(AuthContext).user
 * })
 * ```
 */
export abstract class Macroable {
  [key: string | symbol]: unknown
  /**
   * Per-instance properties. Each entry is applied and bound
   * to `this` inside the constructor so destructuring stays safe.
   */
  protected static instanceMacros = new Set<{ key: string | symbol; value: unknown }>()

  /**
   * Names registered via macro() — used by hasMacro() and flushMacros().
   */
  protected static macroNames = new Set<string | symbol>()

  /**
   * Names registered via getter() — used by hasMacro() and flushMacros().
   */
  protected static getterNames = new Set<string | symbol>()

  /**
   * Original prototype values saved before macro() overrides them.
   * Used by flushMacros() to restore native methods.
   */
  private static _originals = new Map<string | symbol, { existed: boolean; value: unknown }>()

  // ── Macros (prototype-level) ──────────────────────────────

  /**
   * Register a macro on the class prototype.
   * Can override existing methods.
   *
   * When the name matches an existing property, the value type is auto-derived.
   *
   * @param name - Method or property name
   * @param value - Function or value to assign
   */
  static macro<T extends Constructor, K extends keyof InstanceType<T>>(
    this: T,
    name: K,
    value: InstanceType<T>[K],
  ): void
  static macro(name: string | symbol, value: unknown): void
  static macro(name: string | symbol, value: unknown): void {
    if (!Object.prototype.hasOwnProperty.call(this, 'macroNames')) {
      this.macroNames = new Set(this.macroNames)
    }
    if (!Object.prototype.hasOwnProperty.call(this, '_originals')) {
      this._originals = new Map(this._originals)
    }

    // Save the original value before first override so flushMacros() can restore it
    if (!this._originals.has(name)) {
      const existed = Object.prototype.hasOwnProperty.call(this.prototype, name)
      this._originals.set(name, {
        existed,
        value: existed ? (this.prototype as Record<string | symbol, unknown>)[name] : undefined,
      })
    }

    this.macroNames.add(name);
    (this.prototype as Record<string | symbol, unknown>)[name] = value
  }

  // ── Instance properties (bound per-instance) ─────────────

  /**
   * Register a per-instance property that is bound to `this`
   * in the constructor. Safe for destructuring.
   *
   * When the name matches an existing property, the value type is auto-derived.
   *
   * @param name - Property name
   * @param value - Function (will be bound) or value
   */
  static instanceProperty<T extends Constructor, K extends keyof InstanceType<T>>(
    this: T,
    name: K,
    value: InstanceType<T>[K],
  ): void
  static instanceProperty(name: string | symbol, value: unknown): void
  static instanceProperty(name: string | symbol, value: unknown): void {
    if (!Object.prototype.hasOwnProperty.call(this, 'instanceMacros')) {
      this.instanceMacros = new Set(this.instanceMacros)
    }
    this.instanceMacros.add({ key: name, value })
  }

  // ── Getters (Object.defineProperty on prototype) ──────────

  /**
   * Register a computed getter on the class prototype.
   *
   * @param name - Property name
   * @param accumulator - Function that computes the value (called with instance as `this`)
   * @param singleton - If true, cache the value after first access
   */
  static getter<T extends Constructor, K extends keyof InstanceType<T>>(
    this: T,
    name: K,
    accumulator: (this: InstanceType<T>) => InstanceType<T>[K],
    singleton?: boolean,
  ): void
  static getter(name: string | symbol, accumulator: MacroFunction, singleton?: boolean): void
  static getter(
    name: string | symbol,
    accumulator: MacroFunction,
    singleton = false,
  ): void {
    if (!Object.prototype.hasOwnProperty.call(this, 'getterNames')) {
      this.getterNames = new Set(this.getterNames)
    }
    this.getterNames.add(name)

    Object.defineProperty(this.prototype, name, {
      get(): unknown {
        const value: unknown = accumulator.call(this)
        if (singleton) {
          Object.defineProperty(this, name, {
            value,
            configurable: false,
            enumerable: false,
            writable: false,
          })
        }
        return value
      },
      configurable: true,
      enumerable: false,
    })
  }

  // ── Introspection ─────────────────────────────────────────

  /**
   * Check if a macro, instance property, or getter is registered.
   *
   * @param name - Name to check
   */
  static hasMacro(name: string | symbol): boolean {
    return (
      this.macroNames.has(name) ||
      [...this.instanceMacros].some((m) => m.key === name) ||
      this.getterNames.has(name)
    )
  }

  // ── Cleanup ───────────────────────────────────────────────

  /**
   * Remove all macros, instance properties, and getters
   * registered on this class. Does not affect parent classes.
   */
  static flushMacros(): void {
    const proto = this.prototype as Record<string | symbol, unknown>

    // Restore original prototype values or delete if they didn't exist before
    for (const name of this.macroNames) {
      const original = this._originals.get(name)
      if (original?.existed) {
        proto[name] = original.value
      } else {
        Reflect.deleteProperty(proto, name)
      }
    }
    for (const name of this.getterNames) {
      Reflect.deleteProperty(proto, name)
    }

    if (Object.prototype.hasOwnProperty.call(this, 'macroNames')) {
      this.macroNames.clear()
    }
    if (Object.prototype.hasOwnProperty.call(this, 'instanceMacros')) {
      this.instanceMacros.clear()
    }
    if (Object.prototype.hasOwnProperty.call(this, 'getterNames')) {
      this.getterNames.clear()
    }
    if (Object.prototype.hasOwnProperty.call(this, '_originals')) {
      this._originals.clear()
    }
  }

  // ── Constructor (applies instance properties) ─────────────

  constructor() {
    const Constructor = this.constructor as typeof Macroable
    const self = this as Record<string | symbol, unknown>
    Constructor.instanceMacros.forEach(({ key, value }) => {
      if (typeof value === 'function') {
        self[key] = value.bind(this)
      } else {
        self[key] = value
      }
    })
  }
}
