import type { Env, Schema, MergePath, HonoBase } from 'hono'
import type { Constructor } from '../types'
import type { Middleware } from './middleware.interface'

declare module 'hono/types' {
  interface MiddlewareHandlerInterface<E extends Env, S extends Schema, BasePath extends string> {
    (...middlewares: Constructor<Middleware>[]): HonoBase<E, S, BasePath>
    <P extends string>(path: P, ...middlewares: Constructor<Middleware>[]): HonoBase<E, S, BasePath, MergePath<BasePath, P>>
  }
}
