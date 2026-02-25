import { Scalar } from '@scalar/hono-api-reference'
import { inject } from 'tsyringe'
import { Transient } from '../../di/decorators'
import type { II18nService } from '../../i18n'
import { I18N_TOKENS } from '../../i18n'
import type { OpenAPIHono, PathItemObject } from '../../i18n/validation'
import { ROUTER_CONTEXT_KEYS, SECURITY_SCHEMES } from '../../router/constants'
import type { IController } from '../../router/controller'
import { getControllerOptions, getControllerRoute } from '../../router/decorators'
import type { RouterEnv } from '../../router/types'
import type { Constructor } from '../../types'
import { OPENAPI_TOKENS } from '../openapi.tokens'
import type { IOpenAPIConfigService, OpenAPIEffectiveConfig } from '../types'

/**
 * RouteInfo for hideFromDocs filtering
 */
interface RouteInfo {
  hideFromDocs: boolean
}

/**
 * OpenAPI Service
 *
 * Generates OpenAPI specifications with support for:
 * - Runtime configuration via OpenAPIConfigService
 * - Route filtering via hideFromDocs and custom routeFilter
 * - i18n support for titles and descriptions
 * - Security scheme definitions
 *
 * Configuration is resolved per-request from OpenAPIConfigService,
 * allowing middleware to override config based on domain context.
 */
@Transient(OPENAPI_TOKENS.OpenAPIService)
export class OpenAPIService {
  private routeInfoMap = new Map<string, RouteInfo>()

  constructor(
    @inject(OPENAPI_TOKENS.ConfigService)
    private configService: IOpenAPIConfigService
  ) { }

  /**
   * Setup OpenAPI documentation endpoints
   */
  setupEndpoints(app: OpenAPIHono<RouterEnv>, controllers: Constructor<IController>[]): void {
    // Build route info map for hideFromDocs filtering
    this.buildRouteInfoMap(controllers)

    const config = this.configService.getEffectiveConfig()

    // OpenAPI JSON spec endpoint
    app.get(config.jsonPath, (c) => {
      // Get request-scoped services
      const requestContainer = c.get(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER)
      const i18n = requestContainer.resolve<II18nService>(I18N_TOKENS.I18nService)
      const requestConfigService = requestContainer.resolve<IOpenAPIConfigService>(
        OPENAPI_TOKENS.ConfigService
      )

      // Get effective config (with any middleware overrides)
      const effectiveConfig = requestConfigService.getEffectiveConfig()
      const url = new URL(c.req.raw.url)

      // Generate full OpenAPI spec using Hono's built-in generator
      const fullSpec = app.getOpenAPIDocument({
        openapi: '3.0.0',
        info: {
          version: effectiveConfig.info.version,
          title: effectiveConfig.info.title,
          description: effectiveConfig.info.description
        },
        servers: [
          {
            url: `${url.protocol}//${url.host}`,
            description: i18n.t('common.api.serverDescription')
          }
        ]
      })

      // Add security schemes
      fullSpec.components ??= {}
      fullSpec.components.securitySchemes = this.getSecuritySchemeDefinitions(i18n)

      // Filter routes based on hideFromDocs and custom routeFilter
      fullSpec.paths = this.filterRoutes(
        fullSpec.paths as Record<string, PathItemObject>,
        effectiveConfig
      )

      // Filter unreferenced schemas
      if (fullSpec.components.schemas) {
        fullSpec.components.schemas = this.filterSchemas(fullSpec as unknown as Record<string, unknown>) as typeof fullSpec.components.schemas
      }

      return c.json(fullSpec)
    })

    // Swagger UI endpoint
    app.get(config.docsPath, (c, next) => {
      const requestContainer = c.get(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER)
      const requestConfigService = requestContainer.resolve<IOpenAPIConfigService>(
        OPENAPI_TOKENS.ConfigService
      )
      const effectiveConfig = requestConfigService.getEffectiveConfig()

      return Scalar<RouterEnv>({
        url: effectiveConfig.jsonPath,
        pageTitle: effectiveConfig.info.title,
        telemetry: false,
        theme: 'deepSpace',
      })(c, next)
    })
  }

  /**
   * Get localized security scheme definitions
   */
  private getSecuritySchemeDefinitions(i18n: II18nService) {
    return {
      [SECURITY_SCHEMES.BEARER_AUTH]: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: i18n.t('common.api.security.bearerAuth')
      },
      [SECURITY_SCHEMES.API_KEY]: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: i18n.t('common.api.security.apiKey')
      },
      [SECURITY_SCHEMES.SESSION_COOKIE]: {
        type: 'apiKey',
        in: 'cookie',
        name: 'session',
        description: i18n.t('common.api.security.sessionCookie')
      }
    } as const
  }

  /**
   * Build route info map from controllers
   * Maps route prefixes to their hideFromDocs flag
   */
  private buildRouteInfoMap(controllers: Constructor<IController>[]): void {
    for (const ControllerClass of controllers) {
      const route = getControllerRoute(ControllerClass)
      const options = getControllerOptions(ControllerClass)

      if (route) {
        this.routeInfoMap.set(route, {
          hideFromDocs: options?.hideFromDocs ?? false
        })
      }
    }
  }

  /**
   * Filter OpenAPI paths based on hideFromDocs and custom routeFilter
   */
  private filterRoutes(
    paths: Record<string, PathItemObject>,
    config: OpenAPIEffectiveConfig
  ): Record<string, PathItemObject> {
    const filteredPaths: Record<string, PathItemObject> = {}

    for (const [path, pathItem] of Object.entries(paths)) {
      // 1. Check hideFromDocs (always filtered)
      const routeInfo = this.getRouteInfo(path)
      if (routeInfo.hideFromDocs) {
        continue
      }

      // 2. Apply custom routeFilter if provided
      if (config.routeFilter) {
        if (!config.routeFilter(path, pathItem)) {
          continue
        }
      }

      filteredPaths[path] = pathItem
    }

    return filteredPaths
  }

  /**
   * Get route info by matching path against controller routes
   */
  private getRouteInfo(path: string): RouteInfo {
    for (const [route, info] of this.routeInfoMap.entries()) {
      if (path === route || path.startsWith(`${route}/`)) {
        return info
      }
    }

    // Default to visible for unmatched routes
    return { hideFromDocs: false }
  }

  /**
   * Filter unreferenced schemas from OpenAPI spec
   */
  private filterSchemas(spec: Record<string, unknown>): Record<string, unknown> {
    const referencedSchemas = new Set<string>()

    // Collect all schema references from paths
    this.collectSchemaRefs(spec.paths, referencedSchemas)

    // Filter schemas to only include referenced ones
    const filteredSchemas: Record<string, unknown> = {}
    const components = spec.components as Record<string, unknown> | undefined
    if (components?.schemas) {
      for (const [schemaName, schemaValue] of Object.entries(components.schemas as Record<string, unknown>)) {
        if (referencedSchemas.has(schemaName)) {
          filteredSchemas[schemaName] = schemaValue
          // Also collect references from this schema (for nested schemas)
          this.collectSchemaRefs(schemaValue, referencedSchemas)
        }
      }

      // Second pass to include any schemas referenced by included schemas
      for (const [schemaName, schemaValue] of Object.entries(components.schemas as Record<string, unknown>)) {
        if (referencedSchemas.has(schemaName) && !filteredSchemas[schemaName]) {
          filteredSchemas[schemaName] = schemaValue
        }
      }
    }

    return filteredSchemas
  }

  /**
   * Recursively collect all schema references from an object
   */
  private collectSchemaRefs(obj: unknown, refs: Set<string>): void {
    if (!obj || typeof obj !== 'object') {
      return
    }

    const record = obj as Record<string, unknown>

    // Check if this object has a $ref property
    if (record.$ref && typeof record.$ref === 'string') {
      // Extract schema name from $ref (format: #/components/schemas/SchemaName)
      const match = /^#\/components\/schemas\/(.+)$/.exec(record.$ref)
      if (match) {
        refs.add(match[1])
      }
    }

    // Recursively check all properties
    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.collectSchemaRefs(item, refs)
      }
    } else {
      for (const value of Object.values(record)) {
        this.collectSchemaRefs(value, refs)
      }
    }
  }
}
