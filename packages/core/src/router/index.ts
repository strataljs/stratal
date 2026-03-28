// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./hono-middleware-augment.d.ts" />

// Core router types
export type { IController } from './controller'
export type { Middleware, Next } from './middleware.interface'
export type { ControllerOptions, ConventionRouteMetadata, ExplicitRouteMetadata, LocalePathConfig, RouteBody, RouteBodyObject, RouteConfig, RouteMetadata, RouterEnv, RouteResponse, RouteResponseObject, RouterVariables, SecurityScheme, VersioningOptions } from './types'

// Router constants
export { HTTP_METHODS, ROUTE_METADATA_KEYS, ROUTER_CONTEXT_KEYS, SECURITY_SCHEMES, VERSION_NEUTRAL } from './constants'

// Router context
export { RouterContext } from './router-context'

// Streaming types
export type { SSEMessage, SSEStreamingApi } from 'hono/streaming'
export type { StreamingApi } from 'hono/utils/stream'

// HonoApp
export { HonoApp } from './hono-app'

// Router services
export {
  LocalePathService,
  type ResolvedPath,
  RouteRegistrationService,
  VersioningService,
} from './services'

// Router tokens
export { ROUTER_TOKENS } from './router.tokens'

// Route Registry (source of truth for all routes)
export { RouteRegistry, type RegisteredRoute, type RouteRegistrationInput } from './route-registry'

// Route Map (augmentable interface for type-safe URL generation)
export type { StratalRouteMap, RouteName, RouteParams } from './route-map'

// Route URL generation
export { route } from './route-url'

// Router (replaces MiddlewareConfigurable — route + middleware configuration)
export { Router, type RouteConfigurable, type RouterGroupConfig } from './router'

// Path & name utilities
export { toOpenAPIPath, getPathSpecificityScore, sortRoutesBySpecificity } from './utils/path'
export { extractParamNames, extractDomainParamNames, generateConventionRouteName } from './utils/route-name'

// Middleware utilities
export { createMiddlewareChain } from './middleware/middleware-chain'

// Decorators
export {
  Controller, getControllerOptions, getControllerRoute, getControllerVersion
} from './decorators/controller.decorator'
export { All, Delete, Get, Patch, Post, Put } from './decorators/http-method.decorator'
export { getRouteDecoratedMethods, getRouteMetadata, Route } from './decorators/route.decorator'

// Schemas
export * from './schemas'

// Domain middleware
export { createDomainMiddleware, parseDomainPattern } from './middleware/domain.middleware'

// Signed URLs
export { signUrl, verifySignedUrl, type SignedUrlOptions } from './signed-url'
export { VerifySignatureMiddleware } from './middleware/verify-signature.middleware'

// Errors
export {
  ControllerRegistrationError, DuplicateRouteNameError, HonoAppAlreadyConfiguredError,
  MissingEnvironmentVariableError, MissingRouteParamError, OpenAPIRouteRegistrationError,
  OpenAPIValidationError, ResponseValidationError, RouteNameNotFoundError, RouteNotFoundError,
  RouterUseScopeError, SchemaValidationError
} from './errors'
export { DomainMismatchError } from './errors/domain-mismatch.error'
export { InvalidSignatureError } from './errors/invalid-signature.error'
