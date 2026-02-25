import { inject } from 'tsyringe'
import { Transient } from '../../di/decorators'
import { OPENAPI_TOKENS } from '../openapi.tokens'
import type {
  IOpenAPIConfigService,
  OpenAPIConfigOverride,
  OpenAPIEffectiveConfig,
  OpenAPIModuleOptions
} from '../types'

/**
 * OpenAPI Config Service
 *
 * Request-scoped service that manages OpenAPI configuration for the current request.
 * Supports runtime overrides via middleware while preserving base configuration.
 *
 * @example
 * ```typescript
 * // In middleware (e.g., RouteAccessMiddleware)
 * constructor(
 *   @inject(OPENAPI_TOKENS.ConfigService) private openAPIConfig: IOpenAPIConfigService
 * ) {}
 *
 * async handle(ctx, next) {
 *   this.openAPIConfig.override({
 *     info: { title: 'Tenant API' },
 *     routeFilter: (path) => shouldInclude(path)
 *   })
 *   await next()
 * }
 * ```
 */
@Transient(OPENAPI_TOKENS.ConfigService)
export class OpenAPIConfigService implements IOpenAPIConfigService {
  private overrides: OpenAPIConfigOverride[] = []

  constructor(
    @inject(OPENAPI_TOKENS.Options, { isOptional: true }) private baseOptions?: OpenAPIModuleOptions
  ) { }

  /**
   * Add configuration override for this request
   * Overrides are merged in the order they are added
   */
  override(config: OpenAPIConfigOverride): void {
    this.overrides.push(config)
  }

  /**
   * Get effective configuration (base merged with all overrides)
   */
  getEffectiveConfig(): OpenAPIEffectiveConfig {
    // Start with base options and defaults
    let effective: OpenAPIEffectiveConfig = {
      jsonPath: this.baseOptions?.jsonPath ?? '/api/openapi.json',
      docsPath: this.baseOptions?.docsPath ?? '/api/docs',
      info: {
        title: this.baseOptions?.info?.title ?? 'API',
        version: this.baseOptions?.info?.version ?? '1.0.0',
        description: this.baseOptions?.info?.description
      },
      securitySchemes: this.baseOptions?.securitySchemes
    }

    // Merge each override in order
    for (const override of this.overrides) {
      effective = this.mergeConfig(effective, override)
    }

    return effective
  }

  /**
   * Merge override into effective config
   * Info is shallow-merged, routeFilter is replaced
   */
  private mergeConfig(
    base: OpenAPIEffectiveConfig,
    override: OpenAPIConfigOverride
  ): OpenAPIEffectiveConfig {
    return {
      ...base,
      info: {
        ...base.info,
        ...(override.info && {
          title: override.info.title ?? base.info.title,
          version: override.info.version ?? base.info.version,
          description: override.info.description ?? base.info.description
        })
      },
      // Last routeFilter wins
      routeFilter: override.routeFilter ?? base.routeFilter
    }
  }
}
