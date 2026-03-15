import type { MiddlewareHandler } from 'hono/types'
import type { PathItemObject } from '../i18n/validation'
import type { RouterEnv } from '../router/types'

/**
 * OpenAPI Info section configuration
 */
export interface OpenAPIInfo {
  title: string
  version: string
  description?: string
}

/**
 * Context passed to a custom OpenAPI UI renderer
 */
export interface OpenAPIUIContext {
  specUrl: string
  title: string
}

/**
 * Custom UI renderer function
 * Returns a Hono middleware handler that serves the docs UI
 */
export type OpenAPIUIRenderer = (context: OpenAPIUIContext) => MiddlewareHandler<RouterEnv>

/**
 * Options for the docs UI
 */
export interface OpenAPIUIOptions {
  /** Path for docs UI (default: '/api/docs') */
  path?: string
  /** Custom UI renderer (default: swagger UI) */
  renderer?: OpenAPIUIRenderer
}

/**
 * Static module configuration (provided via forRoot)
 */
export interface OpenAPIModuleOptions {
  /** Path for OpenAPI JSON spec (default: '/api/openapi.json') */
  jsonPath?: string

  /** Default info section for spec */
  info?: OpenAPIInfo

  /** Security schemes definition */
  securitySchemes?: Record<string, object>

  /** Docs UI configuration. Set to false to disable. (default: swagger UI at /api/docs) */
  ui?: OpenAPIUIOptions | false
}

/**
 * Route filter function type
 * Returns true to include route, false to exclude
 */
export type RouteFilterFn = (path: string, pathItem: PathItemObject) => boolean

/**
 * Runtime configuration override (set via middleware)
 */
export interface OpenAPIConfigOverride {
  /** Override info section */
  info?: Partial<OpenAPIInfo>

  /** Custom route filter (returns true to include, false to exclude) */
  routeFilter?: RouteFilterFn
}

/**
 * Effective configuration after merging base options with overrides
 */
export interface OpenAPIEffectiveConfig {
  jsonPath: string
  info: OpenAPIInfo
  securitySchemes?: Record<string, object>
  routeFilter?: RouteFilterFn
  ui?: OpenAPIUIOptions | false
}

/**
 * OpenAPI config service interface
 */
export interface IOpenAPIConfigService {
  /**
   * Override config for this request
   * Can be called multiple times; overrides are merged in order
   */
  override(config: OpenAPIConfigOverride): void

  /**
   * Get effective config (base merged with all overrides)
   */
  getEffectiveConfig(): OpenAPIEffectiveConfig
}
