export { CONFIG_TOKENS } from './config.tokens'

// Export ConfigModule
export { ConfigModule, type ConfigModuleOptions } from './config.module'

// Export registerAs
export { registerAs, type ConfigNamespace, type InferConfigType } from './register-as'

// Export types and interfaces
export type { ConfigPath, ConfigPathValue, IConfigService, ModuleConfig } from './config.types'
export { ConfigValidationError } from './config.types'

// Export services (for testing or advanced use cases)
export { ConfigService } from './services/config.service'
