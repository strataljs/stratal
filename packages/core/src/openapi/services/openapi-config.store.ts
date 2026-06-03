import { inject } from '../../di'
import { Singleton } from '../../di/decorators'
import { OPENAPI_TOKENS } from '../openapi.tokens'
import type {
  IOpenAPIConfigStore,
  OpenAPIEffectiveConfig,
  OpenAPIModuleOptions
} from '../types'

/**
 * OpenAPI Config Store
 *
 * Singleton holder of the static base configuration (mount paths, base info,
 * security schemes) derived from `OpenAPIModule.forRoot()` options. It carries
 * no per-request state, so it is the thing to resolve when you need OpenAPI
 * config OUTSIDE a request scope — endpoint mounting at bootstrap, the
 * `mcp:serve` CLI command, etc. Resolving it never throws on its own.
 *
 * Per-request overrides live on {@link OpenAPIConfigService}, which reads the
 * base config from here and merges its overrides on top.
 */
@Singleton(OPENAPI_TOKENS.ConfigStore)
export class OpenAPIConfigStore implements IOpenAPIConfigStore {
  constructor(
    @inject(OPENAPI_TOKENS.Options, { isOptional: true }) private baseOptions?: OpenAPIModuleOptions
  ) { }

  getBaseConfig(): OpenAPIEffectiveConfig {
    return {
      jsonPath: this.baseOptions?.jsonPath ?? '/api/openapi.json',
      ui: this.baseOptions?.ui,
      info: {
        title: this.baseOptions?.info?.title ?? 'API',
        version: this.baseOptions?.info?.version ?? '1.0.0',
        description: this.baseOptions?.info?.description
      },
      securitySchemes: this.baseOptions?.securitySchemes
    }
  }
}
