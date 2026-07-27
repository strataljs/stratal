import type { Container } from '../../di/container'
import { Singleton } from '../../di/decorators'
import { I18N_TOKENS } from '../../i18n/i18n.tokens'
import type { II18nService } from '../../i18n/i18n.types'
import type { OpenAPIObject, ZodType } from '../../i18n/validation/zod'
import { ROUTER_CONTEXT_KEYS, SECURITY_SCHEMES } from '../../router/constants'
import type { HonoApp } from '../../router/hono-app'
import type { RouteMetadataRegistry, RouteResponseMeta, RouteSchemaMeta } from '../../router/route-metadata'
import { ROUTER_TOKENS } from '../../router/router.tokens'
import type { RouterEnv } from '../../router/types'
import { OPENAPI_TOKENS } from '../openapi.tokens'
import type { IOpenAPIConfigService, IOpenAPIConfigStore } from '../types'

/**
 * OpenAPI Service
 *
 * Generates OpenAPI specifications lazily from the route metadata registry:
 * - Built on demand (per request to the spec endpoint), never at startup
 * - Schema → JSON Schema via zod v4's native `z.toJSONSchema()`
 * - Runtime configuration via OpenAPIConfigService
 * - Route visibility via a metadata predicate (`routeFilter`)
 * - i18n support for titles, descriptions, and security schemes
 *
 * Hidden routes (hideFromDocs) are flagged in the metadata and excluded by the
 * generator. The generator and the common error schemas are dynamically
 * imported so `zod`/`common.schemas` never reach the routing path — they load
 * only when the document is actually requested.
 */
@Singleton(OPENAPI_TOKENS.OpenAPIService)
export class OpenAPIService {
  /**
   * Generate a filtered OpenAPI document from collected route metadata.
   * Usable from both HTTP handlers and CLI commands.
   */
  async getSpec(container: Container): Promise<OpenAPIObject> {
    const configService = container.resolve<IOpenAPIConfigService>(OPENAPI_TOKENS.ConfigService)
    const i18n = container.resolve<II18nService>(I18N_TOKENS.I18nService)
    const metadata = container.resolve<RouteMetadataRegistry>(ROUTER_TOKENS.RouteMetadataRegistry)
    const config = configService.getEffectiveConfig()

    const [{ generateOpenAPIDocument }, { commonErrorSchemas }] = await Promise.all([
      import('../openapi-generator'),
      import('../../router/schemas/common.schemas'),
    ])

    const routes = metadata.all().map((route) => this.withCommonErrors(route, commonErrorSchemas))

    return generateOpenAPIDocument({
      info: {
        title: config.info.title,
        version: config.info.version,
        description: config.info.description,
      },
      routes,
      securitySchemes: this.getSecuritySchemeDefinitions(i18n),
      filter: config.routeFilter,
    })
  }

  /**
   * Append the standard error responses (400/401/403/404/409/500) a route
   * doesn't already declare. Done here, in the lazy doc path, so the error
   * schemas never load at registration time.
   */
  private withCommonErrors(
    route: RouteSchemaMeta,
    common: Record<string, { schema: ZodType; description: string }>,
  ): RouteSchemaMeta {
    const present = new Set(route.responses.map((r) => r.status))
    const extra: RouteResponseMeta[] = []
    for (const [status, def] of Object.entries(common)) {
      const code = Number(status)
      if (!present.has(code)) {
        extra.push({ status: code, schema: def.schema, contentType: 'application/json', description: def.description })
      }
    }
    return extra.length ? { ...route, responses: [...route.responses, ...extra] } : route
  }

  /**
   * Setup OpenAPI documentation endpoints
   */
  setupEndpoints(app: HonoApp, container: Container): void {
    // Endpoints are mounted at bootstrap (no request scope), so read the static
    // mount paths from the singleton config store — request overrides (info /
    // routeFilter) never affect jsonPath/ui and are resolved per request inside
    // the handlers below via the request-scoped config service.
    const config = container.resolve<IOpenAPIConfigStore>(OPENAPI_TOKENS.ConfigStore).getBaseConfig()
    const jsonPath = config.jsonPath
    const ui = config.ui

    // OpenAPI JSON spec endpoint
    app.get(jsonPath, async (c) => {
      const requestContainer = c.get(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER)
      const fullSpec = await this.getSpec(requestContainer)

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
    if (ui !== false) {
      const uiPath = ui?.path ?? '/api/docs'
      const uiRenderer = ui?.renderer

      app.get(uiPath, async (c, next) => {
        const requestContainer = c.get(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER)
        const requestConfigService = requestContainer.resolve<IOpenAPIConfigService>(
          OPENAPI_TOKENS.ConfigService
        )
        const effectiveConfig = requestConfigService.getEffectiveConfig()
        const uiContext = { specUrl: effectiveConfig.jsonPath, title: effectiveConfig.info.title }

        if (uiRenderer) {
          return uiRenderer(uiContext)(c, next)
        }

        const { swaggerUI } = await import('@hono/swagger-ui')
        return swaggerUI<RouterEnv>({ url: uiContext.specUrl })(c, next)
      })
      this.nameLastHandler(app, 'OpenAPI', 'docs')
    }
  }

  private nameLastHandler(app: HonoApp, controller: string, method: string): void {
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
}
