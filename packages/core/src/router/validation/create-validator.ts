import type { MiddlewareHandler } from 'hono'
import { validator } from 'hono/validator'
import type { ZodType } from '../../i18n/validation/zod'
import { SchemaValidationError } from '../errors'
import type { RouterEnv } from '../types'

/**
 * Hono validation targets Stratal validates against. Body content types map to
 * `json` or `form`; path/query/header validate the corresponding request part.
 */
export type ValidatorTarget = 'json' | 'form' | 'query' | 'param' | 'header'

/**
 * Build a Hono validator middleware that runs a Zod schema against one request
 * part and populates `c.req.valid(target)` with the parsed (coerced) output.
 *
 * This is the plain-Hono replacement for `@hono/zod-openapi`'s `app.openapi()`
 * validator composition. It carries **no runtime `zod` import** — it only calls
 * `safeParse` on the caller-supplied schema instance and references `ZodType`/
 * `ZodError` as erased types — so a route without a declared schema attaches no
 * validator and pulls in no `zod`.
 *
 * On failure it throws {@link SchemaValidationError}, which the global exception
 * handler renders as a 400 with i18n-translated issues (the Zod error map is
 * installed globally by the I18n module, so messages stay localized).
 *
 * `omit` drops framework-injected request keys (e.g. the `locale` path segment
 * on localized routes) before parsing, so they never reach a user's schema —
 * keeping a `.strict()` schema from rejecting them and keeping `c.req.valid()`
 * limited to the keys the schema actually declares.
 */
export function createValidator(
  target: ValidatorTarget,
  schema: ZodType,
  omit?: readonly string[],
): MiddlewareHandler<RouterEnv> {
  return validator(target, (value) => {
    const record = value as Record<string, unknown>
    const input = omit?.length ? omitKeys(record, omit) : record
    const result = schema.safeParse(input)
    if (!result.success) {
      throw new SchemaValidationError(result.error)
    }
    return result.data
  })
}

function omitKeys(value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key in value) {
    if (!keys.includes(key)) out[key] = value[key]
  }
  return out
}
