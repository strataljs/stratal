/**
 * DI Type Definitions
 *
 * Core type definitions for the dependency injection system.
 * Simplified after removing LazyProxy - no more type wrappers needed.
 */

import { Lifecycle } from 'tsyringe'
import type InjectionToken from 'tsyringe/dist/typings/providers/injection-token'

/**
 * Service scope for DI registration
 *
 * Maps directly to tsyringe's Lifecycle enum.
 * Scope is specified at registration time via provider configuration,
 * not at class decoration time.
 *
 * @example
 * ```typescript
 * // In module providers:
 * { provide: MY_TOKEN, useClass: MyService, scope: Scope.Singleton }
 *
 * // In Application.ts:
 * container.register(MY_TOKEN, MyService, Scope.Request)
 * ```
 */
/* eslint-disable @typescript-eslint/prefer-literal-enum-member -- values must stay in sync with tsyringe Lifecycle */
export enum Scope {
  /** New instance per resolution (default) */
  Transient = Lifecycle.Transient,
  /** Single instance shared globally */
  Singleton = Lifecycle.Singleton,
  /** New instance per child container (per request) */
  Request = Lifecycle.ContainerScoped,
}
/* eslint-enable @typescript-eslint/prefer-literal-enum-member */

/**
 * Options for conditional binding with `when()` method
 */
export interface WhenOptions {
  /**
   * Cache predicate result after first evaluation.
   * When true, the predicate is evaluated once and the result is reused.
   * When false (default), predicate is evaluated on each resolution.
   */
  cache?: boolean
}

/**
 * Decorator function type for extend() method
 *
 * @template T The service type being decorated
 */
export type ExtensionDecorator<T> = (service: T, container: ContainerLike) => T

/**
 * Minimal container interface for decorator functions
 * Avoids circular dependency with Container class
 */
export interface ContainerLike {
  resolve<T>(token: InjectionToken<T>): T
}

