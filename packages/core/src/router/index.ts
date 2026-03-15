// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./hono-middleware-augment.d.ts" />

// Core router types
export type { IController } from './controller'
export type { Middleware } from './middleware.interface'
export type { ControllerOptions, HttpRouteMetadata, RouteBody, RouteBodyObject, RouteConfig, RouterEnv, RouteResponse, RouteResponseObject, RouterVariables, SecurityScheme, VersioningOptions } from './types'

// Router constants
export { HTTP_METHODS, ROUTE_METADATA_KEYS, ROUTER_CONTEXT_KEYS, SECURITY_SCHEMES, VERSION_NEUTRAL } from './constants'

// Router context
export { RouterContext } from './router-context'

// Streaming types
export type { StreamingApi } from 'hono/utils/stream'
export type { SSEStreamingApi, SSEMessage } from 'hono/streaming'

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
  Controller, getControllerOptions, getControllerRoute, getControllerVersion
} from './decorators/controller.decorator'
export { All, Delete, Get, getHttpDecoratedMethods, getHttpRouteMetadata, Patch, Post, Put } from './decorators/http-method.decorator'
export { getDecoratedMethods, getRouteConfig, Route } from './decorators/route.decorator'

// Schemas
export * from './schemas'

// Errors
export {
  ControllerRegistrationError, HonoAppAlreadyConfiguredError, OpenAPIRouteRegistrationError, OpenAPIValidationError, RouteNotFoundError
} from './errors'
