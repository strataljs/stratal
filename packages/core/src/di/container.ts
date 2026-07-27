import type { RouterContext } from '../router/router-context';
import { ROUTER_TOKENS } from '../router/router.tokens';
import type { Constructor } from '../types';
import { ConditionalBindingBuilderImpl, type ConditionalBindingBuilder, type PredicateContainer } from './conditional-binding-builder';
import { containerStorage } from './container-storage';
import { ContainerError } from './container.error';
import { getClassMetadata } from './decorators';
import { getInjectionTokens } from './decorators/inject.decorator';
import { disposeInstance, isDisposable } from './disposable';
import { isLazyToken, type LazyToken } from './lazy';
import { CONTAINER_TOKEN } from './tokens';
import { Scope, type ExtensionDecorator, type InjectionToken, type WhenOptions } from './types';

interface ClassRegistration {
  kind: 'class'
  useClass: Constructor
  scope: Scope
}

interface LazyClassRegistration {
  kind: 'lazy'
  factory: () => Constructor
}

interface ValueRegistration {
  kind: 'value'
  value: unknown
}

interface FactoryRegistration {
  kind: 'factory'
  factory: (container: Container) => unknown
}

interface AliasRegistration {
  kind: 'alias'
  target: InjectionToken
}

type Registration = ClassRegistration | LazyClassRegistration | ValueRegistration | FactoryRegistration | AliasRegistration

function tokenToString(token: InjectionToken): string {
  if (typeof token === 'symbol') return token.description ?? 'Symbol'
  if (typeof token === 'function') return token.name
  if (typeof token === 'object' && token !== null && 'factory' in token) return '(lazy)'
  return String(token)
}

export interface ContainerOptions {
  parent?: Container
  isRequestScoped?: boolean
}

export class Container {
  private readonly registrations = new Map<InjectionToken, Registration>()
  private readonly singletons = new Map<InjectionToken, unknown>()
  private readonly requestCache = new Map<InjectionToken, unknown>()
  private readonly requestCacheDeps = new Map<InjectionToken, Set<InjectionToken>>()
  /**
   * Classes currently being constructed, held on the root so it spans the
   * global ↔ request-scope boundary. Used to turn an otherwise-opaque stack
   * overflow on a circular dependency into a clear error naming the cycle.
   */
  private readonly resolutionStack: Constructor[] = []
  private readonly parent: Container | null
  private readonly isRequestScoped: boolean

  constructor(options: ContainerOptions = {}) {
    this.parent = options.parent ?? null
    this.isRequestScoped = options.isRequestScoped ?? false

    if (!this.isRequestScoped) {
      this.registrations.set(CONTAINER_TOKEN, { kind: 'value', value: this })
    }
  }

  // ── Registration ──────────────────────────────────────────────

  register<T extends object>(serviceClass: Constructor<T>): void
  register<T extends object>(token: InjectionToken<T>, serviceClassOrLazy: Constructor<T> | LazyToken<T>): void
  register<T extends object>(
    tokenOrClass: InjectionToken<T> | Constructor<T>,
    serviceClassOrLazy?: Constructor<T> | LazyToken<T>,
  ): void {
    if (serviceClassOrLazy !== undefined && isLazyToken(serviceClassOrLazy)) {
      const lazyToken = serviceClassOrLazy
      this.registrations.set(tokenOrClass, {
        kind: 'lazy',
        factory: lazyToken.factory,
      })
      return
    }

    let token: InjectionToken<T>
    let impl: Constructor<T>

    if (serviceClassOrLazy !== undefined) {
      token = tokenOrClass
      impl = serviceClassOrLazy
    } else {
      token = tokenOrClass
      impl = tokenOrClass as Constructor<T>
    }

    const meta = getClassMetadata(impl)
    const scope = meta?.scope ?? Scope.Transient
    const effectiveToken = (serviceClassOrLazy === undefined && meta?.token) ? meta.token : token

    this.registrations.set(effectiveToken, { kind: 'class', useClass: impl, scope })
  }

  registerSingleton<T extends object>(serviceClass: Constructor<T>): void
  registerSingleton<T extends object>(token: InjectionToken<T>, serviceClass: Constructor<T>): void
  registerSingleton<T extends object>(
    tokenOrClass: InjectionToken<T> | Constructor<T>,
    serviceClass?: Constructor<T>,
  ): void {
    const impl = serviceClass ?? tokenOrClass as Constructor<T>
    const meta = getClassMetadata(impl)
    const token = serviceClass !== undefined
      ? tokenOrClass
      : (meta?.token ?? tokenOrClass)
    this.registrations.set(token, { kind: 'class', useClass: impl, scope: Scope.Singleton })
  }

  registerValue<T>(token: InjectionToken<T>, value: T): void {
    this.registrations.set(token, { kind: 'value', value })
    if (this.isRequestScoped) {
      this.invalidateRequestCache(token)
    }
  }

  registerFactory<T>(token: InjectionToken<T>, factory: (container: Container) => T): void {
    this.registrations.set(token, { kind: 'factory', factory })
  }

  registerExisting<T>(alias: InjectionToken<T>, target: InjectionToken<T>): void {
    this.registrations.set(alias, { kind: 'alias', target })
  }

  // ── Resolution ────────────────────────────────────────────────

  resolve<T>(token: InjectionToken<T>): T {
    if (isLazyToken(token)) {
      const realToken = token.factory() as InjectionToken<T>
      return this.resolve(realToken)
    }

    // Check request cache (request-scoped containers)
    if (this.isRequestScoped && this.requestCache.has(token)) {
      return this.requestCache.get(token) as T
    }

    // Check local registrations first
    const reg = this.registrations.get(token)
    if (reg) return this.resolveRegistration(token, reg) as T

    // Check parent chain — request-scoped containers resolve locally to access request values
    if (this.parent) {
      const parentReg = this.parent.findRegistration(token)
      if (parentReg) {
        if (this.isRequestScoped) {
          return this.resolveRegistration(token, parentReg) as T
        }
        return this.parent.resolve(token)
      }
    }

    // Auto-resolve class constructors: any class with DI decorators can be
    // instantiated without explicit registration
    if (typeof token === 'function') {
      const meta = getClassMetadata(token)
      const scope = meta?.scope ?? Scope.Transient
      const classReg: ClassRegistration = { kind: 'class', useClass: token as unknown as Constructor, scope }
      this.getRoot().registrations.set(token, classReg)
      return this.resolveClass(token, classReg) as T
    }

    throw new ContainerError(`No provider for ${tokenToString(token)}. Did you forget to register it?`)
  }

  tryResolve<T>(token: InjectionToken<T>): T | undefined {
    const realToken = isLazyToken(token) ? (token.factory() as InjectionToken<T>) : token

    // Only "nothing is registered" yields undefined for an optional dependency.
    // A provider that exists but throws while constructing is a real error and
    // must surface — swallowing it would silently inject `undefined` and turn a
    // bug into a baffling downstream failure.
    if (!this.isResolvable(realToken)) return undefined

    // An optional request-scoped dependency outside a request scope is absent,
    // not an error — mirrors `@inject(..., { isOptional: true })` semantics.
    if (!this.isRequestScoped && this.scopeForToken(realToken) === Scope.Request) return undefined

    return this.resolve(realToken)
  }

  isRegistered<T>(token: InjectionToken<T>): boolean {
    if (this.registrations.has(token)) return true
    return this.parent?.isRegistered(token) ?? false
  }

  /**
   * Whether a token has anything to resolve to: an explicit registration, or a
   * bare class constructor (auto-resolvable). Distinct from {@link isRegistered}
   * so {@link tryResolve} can tell "no provider" (→ undefined) apart from
   * "provider exists but failed" (→ rethrow).
   */
  private isResolvable(token: InjectionToken): boolean {
    return typeof token === 'function' || this.isRegistered(token)
  }

  // ── Conditional ───────────────────────────────────────────────

  when(
    predicate: (container: PredicateContainer) => boolean,
    options: WhenOptions = {},
  ): ConditionalBindingBuilder {
    return new ConditionalBindingBuilderImpl(this, predicate, options)
  }

  extend<T>(token: InjectionToken<T>, decorator: ExtensionDecorator<T>): void {
    const current = this.resolve<T>(token)
    const decorated = decorator(current, this)
    this.registerValue(token, decorated)
  }

  // ── Request Scope ─────────────────────────────────────────────

  async runInRequestScope<T>(
    routerContext: RouterContext,
    callback: (requestContainer: Container) => T | Promise<T>,
  ): Promise<T> {
    if (this.isRequestScoped) {
      throw new ContainerError('Cannot call runInRequestScope on a request-scoped container')
    }

    const requestContainer = this.createRequestScope(routerContext)
    return await containerStorage.run(requestContainer, () => callback(requestContainer))
  }

  createRequestScope(routerContext: RouterContext): Container {
    if (this.isRequestScoped) {
      throw new ContainerError('Cannot call createRequestScope on a request-scoped container')
    }

    const child = new Container({ parent: this, isRequestScoped: true })
    child.registerValue(ROUTER_TOKENS.RouterContext, routerContext)
    return child
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  /**
   * Disposes every container-instantiated instance that implements the
   * {@link Disposable} contract (singletons and request-cached instances),
   * then clears all registrations. Value registrations are not disposed —
   * the container doesn't own them. A failing disposer is logged and
   * skipped so it can't block the rest of the teardown.
   *
   * Instances are disposed in reverse creation order (LIFO): a disposer may
   * still use dependencies that were constructed before its own instance.
   */
  async dispose(): Promise<void> {
    const seen = new Set<unknown>()
    for (const instance of [...this.singletons.values(), ...this.requestCache.values()].reverse()) {
      if (seen.has(instance) || !isDisposable(instance)) continue
      seen.add(instance)
      try {
        await disposeInstance(instance)
      } catch (error) {
        console.error('[stratal] Failed to dispose instance during container teardown:', error)
      }
    }

    this.registrations.clear()
    this.singletons.clear()
    this.requestCache.clear()
    this.requestCacheDeps.clear()
  }

  // ── Internal ──────────────────────────────────────────────────

  /**
   * Transitive constructor dependency tokens of a class, with lazy tokens
   * unwrapped to the concrete token they resolve to. Recorded when a
   * request-scoped instance is cached so {@link invalidateRequestCache} can find
   * dependents.
   *
   * The walk follows class/alias registrations through transient intermediaries:
   * a cached service A that depends on a (non-cached) transient B which depends
   * on token C must still be invalidated when C is re-registered, even though B
   * itself is never cached. Value/factory/lazy providers are not traversed —
   * their dependencies aren't introspectable (factory) or would re-enter a
   * cycle (lazy). Over-collecting is safe: it only rebuilds extra request-scoped
   * instances, which is correct.
   */
  private collectDependencyTokens(Class: Constructor): Set<InjectionToken> {
    const deps = new Set<InjectionToken>()
    const visited = new Set<Constructor>()

    const walk = (cls: Constructor): void => {
      if (visited.has(cls)) return
      visited.add(cls)
      for (const { token } of getInjectionTokens(cls).values()) {
        const real = isLazyToken(token) ? token.factory() : token
        deps.add(real)
        const childClass = this.classForToken(real)
        if (childClass) walk(childClass)
      }
    }

    walk(Class)
    return deps
  }

  /** The implementing class for a token, following class/alias registrations. */
  private classForToken(token: InjectionToken): Constructor | undefined {
    const reg = this.findRegistration(token)
    if (reg) {
      if (reg.kind === 'class') return reg.useClass
      if (reg.kind === 'alias') return this.classForToken(reg.target)
      return undefined
    }
    // A bare constructor token that is auto-resolvable (carries DI metadata).
    if (typeof token === 'function' && getClassMetadata(token)) {
      return token as unknown as Constructor
    }
    return undefined
  }

  /**
   * The effective scope a token would resolve with, following alias
   * registrations. Bare constructor tokens fall back to their decorator
   * metadata — the same scope {@link resolve} uses when auto-registering.
   */
  private scopeForToken(token: InjectionToken): Scope | undefined {
    const reg = this.findRegistration(token)
    if (reg) {
      if (reg.kind === 'class') return reg.scope
      if (reg.kind === 'alias') return this.scopeForToken(reg.target)
      // Same scope derivation `resolveRegistration` uses for lazy registrations
      if (reg.kind === 'lazy') return getClassMetadata(reg.factory())?.scope ?? Scope.Transient
      return undefined
    }
    if (typeof token === 'function') {
      return getClassMetadata(token)?.scope
    }
    return undefined
  }

  /**
   * Evict a token from the request cache along with every cached request-scoped
   * instance that transitively depends on it. Re-registering a value must
   * rebuild its dependents (so they pick up the new value) while leaving
   * unrelated cached services intact.
   */
  private invalidateRequestCache(token: InjectionToken): void {
    const invalidated = new Set<InjectionToken>([token])

    let changed = true
    while (changed) {
      changed = false
      for (const [cachedToken, deps] of this.requestCacheDeps) {
        if (invalidated.has(cachedToken)) continue
        for (const dep of deps) {
          if (invalidated.has(dep)) {
            invalidated.add(cachedToken)
            changed = true
            break
          }
        }
      }
    }

    for (const t of invalidated) {
      this.requestCache.delete(t)
      this.requestCacheDeps.delete(t)
    }
  }

  private resolveRegistration(token: InjectionToken, reg: Registration): unknown {
    switch (reg.kind) {
      case 'value':
        return reg.value

      case 'alias':
        return this.resolve(reg.target)

      case 'factory':
        return reg.factory(this)

      case 'lazy': {
        const useClass = reg.factory()
        const scope = getClassMetadata(useClass)?.scope ?? Scope.Transient
        return this.resolveClass(token, { kind: 'class', useClass, scope })
      }

      case 'class':
        return this.resolveClass(token, reg)
    }
  }

  private resolveClass(token: InjectionToken, reg: ClassRegistration): unknown {
    const { useClass, scope } = reg

    // Singleton: check global cache (root or current)
    if (scope === Scope.Singleton) {
      const root = this.getRoot()
      if (root.singletons.has(token)) return root.singletons.get(token)
      // Always construct against the root container. Constructing against a
      // request-scoped child would let the singleton permanently capture that
      // one request's request-scoped dependencies (a captive dependency leaking
      // state across every later request on the isolate). Resolving a @Request
      // dependency from root instead throws the request-scope error below,
      // surfacing the illegal singleton→request dependency loudly.
      const instance = root.instantiate(useClass)
      root.singletons.set(token, instance)
      return instance
    }

    // Request: cache in the request-scoped container
    if (scope === Scope.Request) {
      if (!this.isRequestScoped) {
        throw new ContainerError(
          `Cannot resolve request-scoped provider ${tokenToString(token)} outside a request scope. ` +
            `Resolve it within an HTTP request, or via runInScope()/runInRequestScope() for queues, cron, and other non-HTTP entrypoints.`,
        )
      }
      if (this.requestCache.has(token)) return this.requestCache.get(token)
      const instance = this.instantiate(useClass)
      this.requestCache.set(token, instance)
      this.requestCacheDeps.set(token, this.collectDependencyTokens(useClass))
      return instance
    }

    // Transient: always new instance
    return this.instantiate(useClass)
  }

  private instantiate(Class: Constructor): unknown {
    const root = this.getRoot()

    // A class re-entering its own construction is a circular dependency. Detect
    // it and throw a clear error naming the cycle instead of recursing into a
    // stack overflow. `lazy()` only defers a forward *reference*, not
    // resolution, so it cannot break a true runtime cycle — the graph must be
    // refactored.
    if (root.resolutionStack.includes(Class)) {
      const cycle = [...root.resolutionStack, Class].map((c) => c.name).join(' → ')
      throw new ContainerError(
        `Circular dependency detected while constructing: ${cycle}. ` +
          `Break the cycle by extracting the shared dependency, or inject a provider/factory instead of the instance.`,
      )
    }

    root.resolutionStack.push(Class)
    try {
      const injections = getInjectionTokens(Class)

      // Without reflect-metadata there is no `design:paramtypes` fallback, so every
      // constructor dependency must carry an explicit @inject. A required parameter
      // with no entry would otherwise be silently injected as `undefined`; fail loud.
      if (injections.size === 0) {
        if (Class.length > 0) {
          throw new ContainerError(
            `${Class.name} has ${Class.length} required constructor parameter(s) but none are decorated with @inject. ` +
              `Every constructor dependency must be explicitly injected.`,
          )
        }
        return new Class()
      }

      const maxIndex = Math.max(...injections.keys())
      const args: unknown[] = new Array(maxIndex + 1)

      for (let index = 0; index <= maxIndex; index++) {
        const entry = injections.get(index)
        if (!entry) {
          throw new ContainerError(
            `${Class.name} is missing @inject on constructor parameter ${index}. ` +
              `Every constructor dependency must be explicitly injected.`,
          )
        }
        args[index] = entry.optional ? this.tryResolve(entry.token) : this.resolve(entry.token)
      }

      return new Class(...args)
    } finally {
      root.resolutionStack.pop()
    }
  }

  findRegistration(token: InjectionToken): Registration | undefined {
    const local = this.registrations.get(token)
    if (local) return local
    return this.parent?.findRegistration(token)
  }

  /**
   * The global (non-request-scoped) container at the top of the parent chain.
   * Lazy module loading registers providers here so singletons persist across
   * requests even when `load()` is called from within a request scope.
   */
  getRootContainer(): Container {
    return this.getRoot()
  }

  private getRoot(): Container {
    if (!this.parent) return this
    return this.parent.getRoot()
  }
}
