import { Transient } from '../di/decorators';
import { ExceptionHandler } from './exception-handler';

/**
 * DefaultExceptionHandler — the built-in exception handler used when no
 * custom handler is provided via `ApplicationConfig.exceptionHandler`.
 *
 * Has an empty `register()` method, so all exceptions flow through the
 * default pipeline: severity-based logging, i18n translation, and JSON
 * error response serialization.
 *
 * To customize exception handling, extend {@link ExceptionHandler} and
 * override `register()`, then pass your class to the Stratal config:
 *
 * @example
 * ```typescript
 * new Stratal({
 *   module: AppModule,
 *   exceptionHandler: AppExceptionHandler,
 * })
 * ```
 */
@Transient()
export class DefaultExceptionHandler extends ExceptionHandler {
  register(): void {
    // No custom configuration — uses all defaults
  }
}
