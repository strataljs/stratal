import type { Container } from '../di'
import { type StratalEnv } from '../env'
import type { RouteConfig as OpenAPIRouteConfig, ZodObject, ZodPipe, ZodType } from '../i18n/validation'
import { type HTTP_METHODS, type ROUTER_CONTEXT_KEYS, type SECURITY_SCHEMES, type VERSION_NEUTRAL } from './constants'

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
  /**
   * When set by middleware, the defaultHook returns this response after
   * successful validation — skipping the controller handler entirely.
   * Used by packages like `@stratal/inertia` for precognition support.
   */
  validationSuccessResponse?: Response
  /** Domain parameters set by the domain matching middleware (e.g., `domain:tenant`) */
  [key: `domain:${string}`]: string
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
export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options' | 'trace' | 'all'

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
 * Object form for request body with optional content type
 */
export interface RouteBodyObject { schema: ZodType; contentType?: string }

/**
 * Request body definition for @Route() decorator
 * Bare ZodType defaults to application/json
 */
export type RouteBody = ZodType | RouteBodyObject

/**
 * Object form for response with optional description and content type
 */
export interface RouteResponseObject { schema: ZodType; description?: string; contentType?: string }

/**
 * Single response definition for @Route() decorator
 * Status code is auto-derived from method name (create->201, others->200)
 */
export type RouteResponse = ZodType | RouteResponseObject

/**
 * Route configuration for @Route() decorator
 * Defines OpenAPI metadata for a controller method
 */
export interface RouteConfig {
  /**
   * Request body schema (for POST, PUT, PATCH)
   * @example z.object({}) or { schema: z.object({}), contentType: 'multipart/form-data' }
   */
  body?: RouteBody

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
  response?: RouteResponse

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

  /**
   * HTTP success status code for the response
   * Used by HTTP method decorators (@Get, @Post, etc.) to set the success status
   * For @Route() decorator, status code is auto-derived from method name
   */
  statusCode?: number

  /**
   * Explicit route name for URL generation.
   * Used with the `route()` helper and type generation.
   * For convention-based @Route(), names are auto-generated if not provided.
   * For explicit @Get/@Post/etc., names must be provided manually.
   *
   * @example 'users.show', 'health.check'
   */
  name?: string
}

/**
 * Metadata for convention-based routes (@Route decorator)
 * HTTP method and path are auto-derived from the method name
 */
export interface ConventionRouteMetadata {
  type: 'convention'
  config: RouteConfig
}

/**
 * Metadata for explicit routes (@Get, @Post, @Put, @Patch, @Delete, @All decorators)
 * HTTP method and path are explicitly specified
 */
export interface ExplicitRouteMetadata {
  type: 'explicit'
  method: HttpMethod
  path: string
  config: RouteConfig
}

/**
 * Discriminated union for all route metadata
 * Stored under a single metadata key for unified registration
 */
export type RouteMetadata = ConventionRouteMetadata | ExplicitRouteMetadata

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

  /**
   * API version(s) for this controller.
   * When versioning is enabled, routes are prefixed with the version (e.g., /v1/users).
   * Use VERSION_NEUTRAL to opt out of versioning (no prefix applied).
   * Can be a single version string, array of versions, or VERSION_NEUTRAL symbol.
   */
  version?: string | string[] | typeof VERSION_NEUTRAL

  /**
   * Route name prefix for this controller.
   * Prepended to all route names in this controller.
   * Overrides the Router-level name prefix entirely.
   *
   * @example 'admin.' — routes become 'admin.users.index', 'admin.users.show'
   */
  name?: string

  /**
   * Domain pattern for this controller.
   * Overrides the Router-level domain.
   * Use `{param}` for dynamic subdomain segments.
   *
   * @example '{tenant}.myapp.com', 'admin.myapp.com'
   */
  domain?: string
}

/**
 * Versioning configuration for the application.
 * Enables URI-based API versioning when provided to Stratal config.
 */
export interface VersioningOptions {
  /**
   * Prefix for version segments in the URL.
   * @default 'v'
   * @example 'v' produces /v1, /v2; 'api/v' produces /api/v1, /api/v2
   */
  prefix?: string

  /**
   * Default version applied to controllers without explicit version.
   * Controllers with VERSION_NEUTRAL are not affected.
   */
  defaultVersion?: string | string[]
}

/**
 * Locale path configuration for route registration.
 * Controls how locale prefixes are applied to route paths.
 *
 * Built from {@link I18nModuleOptions} when path-based locale detection is enabled.
 */
export interface LocalePathConfig {
  /** All supported locale codes (e.g., `['en', 'fr']`) */
  allLocales: string[]

  /**
   * Locales that require a `/{locale}` path prefix.
   * Excludes `defaultLocale` when `prefixDefaultLocale` is not `true`.
   */
  prefixedLocales: string[]

  /**
   * The default locale used as the unprefixed root, derived from
   * {@link I18nModuleOptions.defaultLocale}.
   * `null` when all locales are prefixed (`prefixDefaultLocale: true`).
   */
  defaultLocale: string | null
}
