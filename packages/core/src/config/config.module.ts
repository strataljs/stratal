import type { z } from '../i18n/validation'
import { DI_TOKENS } from '../di/tokens'
import { Scope } from '../di/types'
import { Module } from '../module'
import type { DynamicModule, ModuleContext, OnInitialize, Provider } from '../module/types'
import { CONFIG_TOKENS } from './config.tokens'
import { ConfigValidationError, ModuleConfig } from './config.types'
import type { ConfigNamespace } from './register-as'
import { ConfigService } from './services/config.service'

/**
 * Any config namespace - uses structural typing for flexibility
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyConfigNamespace = ConfigNamespace<string, any, object>

/**
 * Options for ConfigModule.forRoot
 */
export interface ConfigModuleOptions {
  /**
   * Array of config namespaces created via registerAs()
   */
  load: AnyConfigNamespace[]

  /**
   * Optional Zod schema for validating the merged config
   * Validates the entire config object after all namespaces are merged
   */
  validateSchema?: z.ZodType<object>
}

// Store options for use in onInitialize
let moduleOptions: ConfigModuleOptions | null = null

/**
 * ConfigModule
 *
 * Provides configuration management with namespace support.
 * Uses registerAs() to create typed config namespaces that can be injected.
 *
 * @example
 * ```typescript
 * // Define config namespaces
 * const databaseConfig = registerAs('database', (env) => ({
 *   url: env.DATABASE_URL,
 *   maxConnections: 10
 * }))
 *
 * const emailConfig = registerAs('email', (env) => ({
 *   provider: env.EMAIL_PROVIDER,
 *   from: { name: 'App', email: 'noreply@example.com' }
 * }))
 *
 * // Register in module
 * @Module({
 *   imports: [
 *     ConfigModule.forRoot({
 *       load: [databaseConfig, emailConfig],
 *       validateSchema: AppConfigSchema
 *     })
 *   ]
 * })
 * export class AppModule {}
 *
 * // Inject config
 * constructor(
 *   @inject(CONFIG_TOKENS.ConfigService) private config: IConfigService,
 *   @inject(databaseConfig.KEY) private dbConfig: DatabaseConfig
 * ) {
 *   // Use dot notation
 *   const url = this.config.get('database.url')
 *
 *   // Or inject namespace directly
 *   const url = this.dbConfig.url
 * }
 * ```
 */
@Module({
  providers: [
    // Register the main ConfigService as Singleton so initialization persists
    {
      provide: CONFIG_TOKENS.ConfigService,
      useClass: ConfigService,
      scope: Scope.Singleton,
    },
  ],
})
export class ConfigModule implements OnInitialize {
  /**
   * Configure ConfigModule with namespace loaders
   *
   * @param options - Configuration options
   * @returns Dynamic module with config infrastructure
   */
  static forRoot(options: ConfigModuleOptions): DynamicModule {
    moduleOptions = options

    const providers: Provider[] = []

    // Register each namespace config using asProvider()
    for (const namespace of options.load) {
      providers.push(namespace.asProvider())
    }

    return {
      module: ConfigModule,
      providers,
    }
  }

  /**
   * Initialize config service with merged namespaces
   * Called after all providers are registered
   */
  onInitialize(context: ModuleContext): void {
    if (!moduleOptions) {
      throw new Error('ConfigModule.forRoot() was not called')
    }

    const env = context.container.resolve<unknown>(DI_TOKENS.CloudflareEnv)
    const configService = context.container.resolve<ConfigService>(CONFIG_TOKENS.ConfigService)

    // Build merged config from all namespaces
    const mergedConfig: Record<string, unknown> = {}

    for (const namespace of moduleOptions.load) {
      mergedConfig[namespace.namespace] = namespace.factory(env)
    }

    // Validate if schema provided
    if (moduleOptions.validateSchema) {
      const result = moduleOptions.validateSchema.safeParse(mergedConfig)
      if (!result.success) {
        throw new ConfigValidationError(
          'Configuration validation failed',
          result.error
        )
      }
    }

    // Initialize ConfigService with merged config
    configService.initialize(mergedConfig as ModuleConfig)

    context.logger.debug('ConfigModule initialized', {
      namespaces: moduleOptions.load.map((n) => n.namespace),
    })
  }
}
