// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./hono-middleware-augment.d.ts" />

// Core router types
export type { IController } from './controller'
export type { Middleware } from './middleware.interface'
export type { ControllerOptions, RouteConfig, RouterEnv, RouteResponse, RouterVariables, SecurityScheme } from './types'

// Router constants
export { HTTP_METHODS, ROUTE_METADATA_KEYS, ROUTER_CONTEXT_KEYS, SECURITY_SCHEMES } from './constants'

// Router context
export { RouterContext } from './router-context'

// HonoApp
export { HonoApp } from './hono-app'

// Router services
export {
  RouteRegistrationService
} from './services'

// Router tokens
export { ROUTER_TOKENS } from './router.tokens'

// Decorators
export {
  Controller, getControllerOptions, getControllerRoute
} from './decorators/controller.decorator'
export { getDecoratedMethods, getRouteConfig, Route } from './decorators/route.decorator'

// Schemas
export * from './schemas'

// Errors
export {
  ControllerRegistrationError, HonoAppAlreadyConfiguredError, OpenAPIRouteRegistrationError, OpenAPIValidationError, RouteNotFoundError
} from './errors'
