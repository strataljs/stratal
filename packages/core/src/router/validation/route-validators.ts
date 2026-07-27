import type { MiddlewareHandler } from 'hono'
import type { ZodType } from '../../i18n/validation/zod'
import type { RouterEnv } from '../types'
import { createValidator, type ValidatorTarget } from './create-validator'

/** The framework-injected path key on localized routes; never part of a user schema. */
const LOCALE_PARAM_KEY = 'locale'

/**
 * The request schemas a route declares. Each is optional — a route that
 * declares none attaches no validators and therefore pulls in no `zod`.
 */
export interface RouteValidatorSchemas {
  params?: ZodType
  query?: ZodType
  body?: { schema: ZodType; contentType: string }
  /**
   * True when the route is a locale-prefixed variant. The `locale` path segment
   * is enforced by the route pattern constraint (`/:locale{en|fr}`) and read via
   * `ctx.getLocale()`, so it is stripped before param validation rather than
   * validated with a (zod-requiring) enum.
   */
  isLocaleVariant?: boolean
}

/** Map a body content type to the Hono validation target. */
function bodyTarget(contentType: string): ValidatorTarget {
  return contentType.includes('json') ? 'json' : 'form'
}

/**
 * Assemble the ordered validator middlewares for a route from its declared
 * schemas. Order matches Hono's expectation (param → query → body) and only
 * includes validators for parts the route actually declares.
 */
export function buildRouteValidators(schemas: RouteValidatorSchemas): MiddlewareHandler<RouterEnv>[] {
  const validators: MiddlewareHandler<RouterEnv>[] = []

  if (schemas.params) {
    validators.push(
      createValidator('param', schemas.params, schemas.isLocaleVariant ? [LOCALE_PARAM_KEY] : undefined),
    )
  }
  if (schemas.query) {
    validators.push(createValidator('query', schemas.query))
  }
  if (schemas.body) {
    validators.push(createValidator(bodyTarget(schemas.body.contentType), schemas.body.schema))
  }

  return validators
}
