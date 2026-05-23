import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * Thrown when `ConfigService.get(path)` is called for a path that does not
 * exist — either because the store was never initialized (no
 * `ConfigModule.forRoot()`), or because the path is genuinely absent from
 * the loaded configuration.
 *
 * The requested path is surfaced via `metadata.path` and interpolated into
 * the i18n message to aid debugging.
 */
export class ConfigKeyNotFoundError extends ApplicationError {
  constructor(path: string) {
    super(
      'errors.configKeyNotFound',
      ERROR_CODES.SYSTEM.CONFIG_KEY_NOT_FOUND,
      { path },
    )
  }
}
