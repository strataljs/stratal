import type { RouterContext } from '../router/router-context';
import { ROUTER_TOKENS } from '../router/router.tokens';
import type { Constructor } from '../types';
import { ConditionalBindingBuilderImpl, type ConditionalBindingBuilder, type PredicateContainer } from './conditional-binding-builder';
import { containerStorage } from './container-storage';
import { ContainerError } from './container.error';
import { getClassMetadata } from './decorators';
import { getInjectionTokens } from './decorators/inject.decorator';
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
  scope: Scope
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
        scope: Scope.Request,
      })
      return
    }

    let token: InjectionToken<T>
    let impl: Constructor<T>

    if (serviceClassOrLazy !== undefined) {
      token = tokenOrClass
      impl = serviceClassOrLazy
    } else {
      token = tokenOrClass as Constructor<T>
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
    const token = serviceClass !== undefined ? tokenOrClass : tokenOrClass as Constructor<T>
    const impl = serviceClass ?? tokenOrClass as Constructor<T>
    this.registrations.set(token, { kind: 'class', useClass: impl, scope: Scope.Singleton })
  }

  registerValue<T>(token: InjectionToken<T>, value: T): void {
    this.registrations.set(token, { kind: 'value', value })
    if (this.isRequestScoped) {
      this.requestCache.delete(token)
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
    try {
      return this.resolve(token)
    } catch {
      return undefined
    }
  }

  isRegistered<T>(token: InjectionToken<T>): boolean {
    if (this.registrations.has(token)) return true
    return this.parent?.isRegistered(token) ?? false
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

  dispose(): void {
    this.registrations.clear()
    this.singletons.clear()
    this.requestCache.clear()
  }

  // ── Internal ──────────────────────────────────────────────────

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
        return this.resolveClass(token, { kind: 'class', useClass, scope: reg.scope })
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
      const instance = this.instantiate(useClass)
      root.singletons.set(token, instance)
      return instance
    }

    // Request: cache in the request-scoped container
    if (scope === Scope.Request) {
      if (this.isRequestScoped) {
        if (this.requestCache.has(token)) return this.requestCache.get(token)
        const instance = this.instantiate(useClass)
        this.requestCache.set(token, instance)
        return instance
      }
      // Resolving a request-scoped service from global container — treat as transient
    }

    // Transient: always new instance
    return this.instantiate(useClass)
  }

  private instantiate(Class: Constructor): unknown {
    const injections = getInjectionTokens(Class)

    if (injections.size === 0) {
      return new Class()
    }

    const maxIndex = Math.max(...injections.keys())
    const args: unknown[] = new Array(maxIndex + 1)

    for (const [index, entry] of injections) {
      if (entry.optional) {
        args[index] = this.tryResolve(entry.token)
      } else {
        args[index] = this.resolve(entry.token)
      }
    }

    return new Class(...args)
  }

  findRegistration(token: InjectionToken): Registration | undefined {
    const local = this.registrations.get(token)
    if (local) return local
    return this.parent?.findRegistration(token)
  }

  private getRoot(): Container {
    if (!this.parent) return this
    return this.parent.getRoot()
  }
}
