import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * Error thrown when ConfigModule's onInitialize runs but forRoot() was never called.
 *
 * This means the module was imported without calling ConfigModule.forRoot({ load: [...] }).
 */
export class ConfigModuleNotInitializedError extends ApplicationError {
  constructor() {
    super(
      'errors.configModuleNotInitialized',
      ERROR_CODES.SYSTEM.CONFIG_MODULE_NOT_INITIALIZED
    )
  }
}
