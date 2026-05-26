import { swaggerUI } from '@hono/swagger-ui'
import type { Container } from '../../di/container'
import { Singleton } from '../../di/decorators'
import { I18N_TOKENS } from '../../i18n/i18n.tokens'
import type { II18nService } from '../../i18n/i18n.types'
import type { OpenAPIHono, OpenAPIObject, PathItemObject } from '../../i18n/validation/zod'
import { ROUTER_CONTEXT_KEYS, SECURITY_SCHEMES } from '../../router/constants'
import type { RouterEnv } from '../../router/types'
import { OPENAPI_TOKENS } from '../openapi.tokens'
import type { IOpenAPIConfigService, OpenAPIEffectiveConfig } from '../types'

/**
 * OpenAPI Service
 *
 * Generates OpenAPI specifications with support for:
 * - Runtime configuration via OpenAPIConfigService
 * - Route filtering via custom routeFilter
 * - i18n support for titles and descriptions
 * - Security scheme definitions
 *
 * Hidden routes (hideFromDocs) are excluded at registration time via
 * @hono/zod-openapi's `hide` option and don't appear in the spec.
 *
 * Configuration is resolved per-request from OpenAPIConfigService,
 * allowing middleware to override config based on domain context.
 */
@Singleton(OPENAPI_TOKENS.OpenAPIService)
export class OpenAPIService {

  /**
   * Generate a filtered OpenAPI spec using the user's config.
   * Usable from both HTTP handlers and CLI commands.
   */
  getSpec(app: OpenAPIHono<RouterEnv>, container: Container): OpenAPIObject {
    const configService = container.resolve<IOpenAPIConfigService>(OPENAPI_TOKENS.ConfigService)
    const i18n = container.resolve<II18nService>(I18N_TOKENS.I18nService)
    const config = configService.getEffectiveConfig()

    const fullSpec = app.getOpenAPIDocument({
      openapi: '3.0.0',
      info: {
        version: config.info.version,
        title: config.info.title,
        description: config.info.description,
      },
    })

    // Security schemes
    fullSpec.components ??= {}
    fullSpec.components.securitySchemes = this.getSecuritySchemeDefinitions(i18n)

    // Apply custom routeFilter if provided
    if (config.routeFilter) {
      fullSpec.paths = this.filterRoutes(
        fullSpec.paths as Record<string, PathItemObject>,
        config,
      )
    }

    // Filter unreferenced schemas
    if (fullSpec.components.schemas) {
      fullSpec.components.schemas = this.filterSchemas(fullSpec as unknown as Record<string, unknown>) as typeof fullSpec.components.schemas
    }

    return fullSpec
  }

  /**
   * Setup OpenAPI documentation endpoints
   */
  setupEndpoints(app: OpenAPIHono<RouterEnv>, container: Container): void {
    const configService = container.resolve<IOpenAPIConfigService>(OPENAPI_TOKENS.ConfigService)
    const config = configService.getEffectiveConfig()

    // OpenAPI JSON spec endpoint
    app.get(config.jsonPath, (c) => {
      const requestContainer = c.get(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER)
      const fullSpec = this.getSpec(app, requestContainer)

      // Add servers (HTTP-specific — needs request URL context)
      const url = new URL(c.req.raw.url)
      const i18n = requestContainer.resolve<II18nService>(I18N_TOKENS.I18nService)
      fullSpec.servers = [{
        url: `${url.protocol}//${url.host}`,
        description: i18n.t('common.api.serverDescription'),
      }]

      return c.json(fullSpec)
    })
    this.nameLastHandler(app, 'OpenAPI', 'spec')

    // Docs UI endpoint
    if (config.ui !== false) {
      const uiPath = config.ui?.path ?? '/api/docs'
      const uiRenderer = config.ui?.renderer

      app.get(uiPath, (c, next) => {
        const requestContainer = c.get(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER)
        const requestConfigService = requestContainer.resolve<IOpenAPIConfigService>(
          OPENAPI_TOKENS.ConfigService
        )
        const effectiveConfig = requestConfigService.getEffectiveConfig()
        const uiContext = { specUrl: effectiveConfig.jsonPath, title: effectiveConfig.info.title }

        if (uiRenderer) {
          return uiRenderer(uiContext)(c, next)
        }

        return swaggerUI<RouterEnv>({ url: uiContext.specUrl })(c, next)
      })
      this.nameLastHandler(app, 'OpenAPI', 'docs')
    }
  }

  private nameLastHandler(app: OpenAPIHono<RouterEnv>, controller: string, method: string): void {
    const last = app.routes[app.routes.length - 1]
    Object.defineProperty(last.handler, 'name', { value: `http:${controller}.${method}` })
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
   * Filter OpenAPI paths using custom routeFilter
   */
  private filterRoutes(
    paths: Record<string, PathItemObject>,
    config: OpenAPIEffectiveConfig
  ): Record<string, PathItemObject> {
    const filteredPaths: Record<string, PathItemObject> = {}

    for (const [path, pathItem] of Object.entries(paths)) {
      if (config.routeFilter && !config.routeFilter(path, pathItem)) {
        continue
      }

      filteredPaths[path] = pathItem
    }

    return filteredPaths
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
      const allSchemas = components.schemas as Record<string, unknown>
      let prevSize = 0
      while (referencedSchemas.size > prevSize) {
        prevSize = referencedSchemas.size
        for (const [schemaName, schemaValue] of Object.entries(allSchemas)) {
          if (referencedSchemas.has(schemaName) && !filteredSchemas[schemaName]) {
            filteredSchemas[schemaName] = schemaValue
            this.collectSchemaRefs(schemaValue, referencedSchemas)
          }
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
