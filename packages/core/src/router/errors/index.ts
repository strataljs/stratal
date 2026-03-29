import { ApplicationError, ERROR_CODES, HttpException } from '../../errors'
import { type z, type ZodError } from '../../i18n/validation'

export { ControllerMethodNotFoundError } from './controller-method-not-found.error'

export { ControllerRegistrationError } from './controller-registration.error'

/**
 * Error thrown when a request's host header does not match the expected domain pattern.
 *
 * HTTP Status: 404 Not Found
 */
export class DomainMismatchError extends HttpException {
  constructor() {
    super(404, 'errors.domainMismatch')
  }
}

/**
 * Thrown when registering a named route that conflicts with an existing route name.
 *
 * Error Code: 9010
 */
export class DuplicateRouteNameError extends ApplicationError {
  constructor(name: string, existingHandler: string, newHandler: string) {
    super('errors.duplicateRouteName', ERROR_CODES.ROUTER.DUPLICATE_ROUTE_NAME, {
      name,
      existingHandler,
      newHandler,
    })
  }
}

export { HonoAppAlreadyConfiguredError } from './hono-app-already-configured.error'

/**
 * Error thrown when a signed URL has an invalid or expired signature.
 *
 * HTTP Status: 403 Forbidden
 */
export class InvalidSignatureError extends HttpException {
  constructor() {
    super(403, 'errors.invalidSignature')
  }
}

/**
 * Thrown when a required environment variable is not set.
 *
 * Maps to HTTP 500 via error code range (9xxx → 500).
 */
export class MissingEnvironmentVariableError extends ApplicationError {
  constructor(variable: string) {
    super('errors.missingEnvironmentVariable', ERROR_CODES.SYSTEM.MISSING_ENVIRONMENT_VARIABLE, {
      variable,
    })
  }
}

/**
 * Thrown when a required path or domain parameter is missing during URL generation.
 *
 * Error Code: 9012
 */
export class MissingRouteParamError extends ApplicationError {
  constructor(param: string, name: string, path: string) {
    super('errors.missingRouteParam', ERROR_CODES.ROUTER.MISSING_ROUTE_PARAM, {
      param,
      name,
      path,
    })
  }
}

export { OpenAPIRouteRegistrationError } from './openapi-route-registration.error'
export { OpenAPIValidationError } from './openapi-validation.error'

/**
 * ResponseValidationError
 *
 * Thrown when a controller's response body does not match the declared Zod response schema.
 * Indicates a server-side schema mismatch — the controller is returning data that
 * violates its own API contract.
 */
export class ResponseValidationError extends ApplicationError {
  constructor(zodError: ZodError) {
    const issues = zodError.issues.map((err: z.core.$ZodIssue) => ({
      path: err.path.join('.'),
      message: err.message,
      code: err.code,
    }))

    super(
      'errors.responseValidation',
      ERROR_CODES.VALIDATION.RESPONSE_VALIDATION,
      { issues }
    )
  }
}

/**
 * Thrown when attempting to generate a URL for a route name that doesn't exist in the registry.
 *
 * Error Code: 9011
 */
export class RouteNameNotFoundError extends ApplicationError {
  constructor(name: string) {
    super('errors.routeNameNotFound', ERROR_CODES.ROUTER.ROUTE_NAME_NOT_FOUND, {
      name,
    })
  }
}

export { RouteNotFoundError } from './route-not-found.error'

/**
 * Thrown when `router.use()` is called inside a `group()` callback.
 * `use()` registers global middleware and is only allowed on the root Router.
 *
 * Error Code: 9013
 */
export class RouterUseScopeError extends ApplicationError {
  constructor() {
    super('errors.routerUseScopeViolation', ERROR_CODES.ROUTER.USE_SCOPE_VIOLATION)
  }
}

export { SchemaValidationError } from './schema-validation.error'
