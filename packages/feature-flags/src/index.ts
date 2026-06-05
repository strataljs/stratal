// Module
export { FeatureFlagModule } from './feature-flags.module'
// Inertia share middleware — register it yourself (scoped or global)
export { FeatureFlagShareMiddleware } from './feature-flag-share.middleware'

// Service
export { FeatureFlagService } from './services/feature-flag.service'

// Tokens
export { FEATURE_FLAG_TOKENS } from './feature-flags.tokens'
export type { FeatureFlagToken } from './feature-flags.tokens'

// Error
export { FeatureFlagError } from './feature-flags.error'

// Types
export type {
  FeatureFlagApp,
  FeatureFlagModuleOptions,
  FeatureFlagRegistry,
  FlagManifest,
  FlagValue,
  FlagshipBindingName,
} from './types'
