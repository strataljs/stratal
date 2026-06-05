import type { Constructor } from '../types'
import type { LazyToken } from './lazy'

export type InjectionToken<T = unknown> = Constructor<T> | string | symbol | LazyToken<T>

export enum Scope {
  Transient = 0,
  Singleton = 1,
  Request = 2,
}

export interface WhenOptions {
  cache?: boolean
}

export type ExtensionDecorator<T> = (service: T, container: ContainerLike) => T

export interface ContainerLike {
  resolve<T>(token: InjectionToken<T>): T
  /**
   * Resolves an optional dependency: `undefined` when nothing is registered,
   * or when a request-scoped provider is requested outside a request scope.
   */
  tryResolve<T>(token: InjectionToken<T>): T | undefined
}
