import type { PathItemObject } from '../i18n/validation'

/**
 * OpenAPI Info section configuration
 */
export interface OpenAPIInfo {
  title: string
  version: string
  description?: string
}

/**
 * Static module configuration (provided via forRoot)
 */
export interface OpenAPIModuleOptions {
  /** Path for OpenAPI JSON spec (default: '/api/openapi.json') */
  jsonPath?: string

  /** Path for Swagger UI docs (default: '/api/docs') */
  docsPath?: string

  /** Default info section for spec */
  info?: OpenAPIInfo

  /** Security schemes definition */
  securitySchemes?: Record<string, object>
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
  docsPath: string
  info: OpenAPIInfo
  securitySchemes?: Record<string, object>
  routeFilter?: RouteFilterFn
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
