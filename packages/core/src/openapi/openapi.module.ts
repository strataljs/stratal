/**
 * OpenAPI Module
 *
 * Provides configurable OpenAPI documentation endpoints with runtime override support.
 *
 * Features:
 * - Configurable paths for /openapi.json and /docs
 * - Runtime config overrides via middleware
 * - i18n support for titles and descriptions
 * - Route filtering via hideFromDocs and custom routeFilter
 *
 * @example Basic usage
 * ```typescript
 * @Module({
 *   imports: [
 *     OpenAPIModule.forRoot({
 *       info: { title: 'My API', version: '1.0.0' }
 *     })
 *   ]
 * })
 * export class AppModule {}
 * ```
 *
 * @example With runtime override in middleware
 * ```typescript
 * // In RouteAccessMiddleware
 * constructor(
 *   @inject(OPENAPI_TOKENS.ConfigService) private openAPIConfig: IOpenAPIConfigService
 * ) {}
 *
 * async handle(ctx, next) {
 *   this.openAPIConfig.override({
 *     info: { title: 'Custom API' },
 *     routeFilter: (path) => this.shouldInclude(path)
 *   })
 *   await next()
 * }
 * ```
 */

import { Scope } from '../di'
import { Module } from '../module'
import type { AsyncModuleOptions, DynamicModule } from '../module/types'
import { OPENAPI_TOKENS } from './openapi.tokens'
import { OpenAPIConfigService, OpenAPIService } from './services'
import type { OpenAPIModuleOptions } from './types'

/** Default options when none provided */
const DEFAULT_OPTIONS: OpenAPIModuleOptions = {
  jsonPath: '/api/openapi.json',
  docsPath: '/api/docs',
  info: {
    title: 'API',
    version: '1.0.0'
  }
}

@Module({
  providers: [
    // OpenAPI config service (request-scoped, supports runtime overrides)
    { provide: OPENAPI_TOKENS.ConfigService, useClass: OpenAPIConfigService, scope: Scope.Request },
    // OpenAPI service (generates specs, serves endpoints)
    { provide: OPENAPI_TOKENS.OpenAPIService, useClass: OpenAPIService },
  ],
})
export class OpenAPIModule {
  /**
   * Configure OpenAPI module with static options
   *
   * @param options - OpenAPI configuration (paths, info, security schemes)
   * @returns DynamicModule with options provider
   */
  static forRoot(options: OpenAPIModuleOptions = {}): DynamicModule {
    // Merge with defaults
    const mergedOptions: OpenAPIModuleOptions = {
      ...DEFAULT_OPTIONS,
      ...options,
      info: {
        ...DEFAULT_OPTIONS.info,
        ...options.info,
        title: options.info?.title ?? DEFAULT_OPTIONS.info?.title ?? 'API',
        version: options.info?.version ?? DEFAULT_OPTIONS.info?.version ?? '1.0.0',
      }
    }

    return {
      module: OpenAPIModule,
      providers: [
        { provide: OPENAPI_TOKENS.Options, useValue: mergedOptions }
      ]
    }
  }

  static forRootAsync(options: AsyncModuleOptions<OpenAPIModuleOptions>): DynamicModule {
    return {
      module: OpenAPIModule,
      providers: [
        {
          provide: OPENAPI_TOKENS.Options,
          useFactory: options.useFactory,
          inject: options.inject
        },
      ]
    }
  }
}
