// Re-export guard utilities from stratal core
export {
  UseGuards,
  getControllerGuards,
  getMethodGuards,
  GuardExecutionService,
  GUARD_METADATA_KEY,
  type CanActivate,
  type Guard,
  type GuardClass,
  type GuardMetadata,
  type AuthGuardOptions,
} from 'stratal/guards'

// Export framework-specific guards
export { AuthGuard } from './auth.guard'
