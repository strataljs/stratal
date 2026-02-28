import type { ZodObject, ZodPipe, ZodType, RouteConfig as OpenAPIRouteConfig } from '../i18n/validation'
import { type StratalEnv } from '../env'
import type { Container } from '../di'
import { type HTTP_METHODS, type ROUTER_CONTEXT_KEYS, type SECURITY_SCHEMES } from './constants'

/**
 * Route parameter type for OpenAPI
 * ZodObject or ZodPipe (piped validation)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ZodObject/ZodPipe generics require any for shape parameter
type ZodObjectWithEffect = ZodObject<any> | ZodPipe<any, any>
type RouteParameter = ZodObjectWithEffect | undefined

/**
 * Hono context variables with type-safe keys
 */
export interface RouterVariables {
  [ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER]: Container
  [ROUTER_CONTEXT_KEYS.LOCALE]?: string
}

/**
 * Hono environment type for router
 */
export interface RouterEnv {
  Bindings: StratalEnv
  Variables: RouterVariables
}

/**
 * Security scheme identifier type
 * Matches the keys in SECURITY_SCHEMES constant
 */
export type SecurityScheme = typeof SECURITY_SCHEMES[keyof typeof SECURITY_SCHEMES]

/**
 * RESTful controller method name type
 * Derived from HTTP_METHODS constant
 */
export type MethodName = keyof typeof HTTP_METHODS

/**
 * HTTP method type from OpenAPI spec
 */
export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options' | 'trace'

/**
 * Security scheme record for OpenAPI security array format
 * Maps scheme names to scopes (empty array for no scopes)
 */
export type SecuritySchemeRecord = Record<SecurityScheme, string[]>

/**
 * Re-export OpenAPI RouteConfig for internal use
 */
export type { OpenAPIRouteConfig }

/**
 * Single response definition for @Route() decorator
 * Status code is auto-derived from method name (create->201, others->200)
 */
export type RouteResponse = ZodType | { schema: ZodType; description?: string }

/**
 * Route configuration for @Route() decorator
 * Defines OpenAPI metadata for a controller method
 */
export interface RouteConfig {
  /**
   * Request body schema (for POST, PUT, PATCH)
   */
  body?: ZodType

  /**
   * URL parameters schema (e.g., { id: z.string().uuid() })
   * Must be ZodObject or ZodPipe for OpenAPI compatibility
   */
  params?: RouteParameter

  /**
   * Query parameters schema (e.g., pagination, filters)
   * Must be ZodObject or ZodPipe for OpenAPI compatibility
   */
  query?: RouteParameter

  /**
   * Response schema for success case
   * Status code auto-derived: create()->201, others->200
   * @example userSchema or { schema: userSchema, description: 'User details' }
   */
  response: RouteResponse

  /**
   * OpenAPI tags for grouping endpoints
   * Merged with controller-level tags
   */
  tags?: string[]

  /**
   * Security schemes required for this route
   * Merged with controller-level security
   * Empty array = public route (no auth)
   */
  security?: SecurityScheme[]

  /**
   * Human-readable description for OpenAPI docs
   */
  description?: string

  /**
   * Detailed summary for OpenAPI docs
   */
  summary?: string

  /**
   * Hide this route from OpenAPI documentation
   * Route remains functional but won't appear in /api/docs or /api/openapi.json
   * Useful for internal-only endpoints, debug routes, or work-in-progress features
   */
  hideFromDocs?: boolean
}

/**
 * Controller options for @Controller() decorator
 * Provides default configuration for all routes in the controller
 */
export interface ControllerOptions {
  /**
   * Default tags applied to all routes in this controller
   * Routes can append additional tags
   */
  tags?: string[]

  /**
   * Default security schemes applied to all routes
   * Routes can add more schemes or override with empty array
   */
  security?: SecurityScheme[]

  /**
   * Hide all routes in this controller from OpenAPI documentation
   * Routes remain functional but won't appear in /api/docs or /api/openapi.json
   * Can be overridden at route level with hideFromDocs: false
   * Useful for internal-only controllers, debug endpoints, or utilities
   */
  hideFromDocs?: boolean
}
