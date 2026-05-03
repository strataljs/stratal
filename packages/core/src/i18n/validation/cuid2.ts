import { z } from '@hono/zod-openapi';
import { type $ZodRawIssue } from 'zod/v4/core';

/**
 * Default cuid2 shape: 24-32 lowercase-alphanumeric chars, starting with a
 * letter. Matches what `@paralleldrive/cuid2` produces with default settings
 * and what most apps expect when they say "cuid2".
 *
 * Used as the default for {@link cuid2}; exposed for callers who want to
 * compose it into other patterns.
 */
export const CUID2_REGEX = /^[a-z][0-9a-z]{23,31}$/

/**
 * Stratal's cuid2 validator — a stricter drop-in for Zod 4.3.6's `z.cuid2()`.
 *
 * **Why this exists.** Zod 4.3.6's built-in `z.cuid2()` uses the regex
 * `/^[0-9a-z]+$/`, which accepts *any* non-empty lowercase-alphanumeric
 * string (including 2-letter locale prefixes like `'sw'`). That makes it
 * effectively useless as a tenant-id / external-id validator.
 *
 * This helper layers the proper shape regex on top of `z.cuid2()`, so:
 * - validation actually enforces cuid2 shape;
 * - the schema still carries `z.cuid2()`'s OpenAPI metadata (i.e. spec
 *   output keeps `format: 'cuid2'`).
 *
 * @example
 * ```ts
 * import { z, withI18n } from 'stratal/validation'
 * import { cuid2 } from 'stratal/validation'
 *
 * // Default 24-32 char cuid2:
 * router.prefix('/:tenantId', z.object({ tenantId: cuid2() }))
 *
 * // Custom regex (e.g. fixed-length 24):
 * router.prefix('/:tenantId', z.object({
 *   tenantId: cuid2({ pattern: /^[a-z][0-9a-z]{23}$/ }),
 * }))
 *
 * // Custom error message:
 * cuid2(withI18n('tenants.errors.invalidId'))
 *
 * // Compose: chain anything Zod string accepts
 * cuid2().describe('Tenant ID')
 * ```
 *
 * @param options.pattern - Override the shape regex. Defaults to {@link CUID2_REGEX}.
 * @param options.error - Custom error message (string or i18n key) for the regex check.
 */
export function cuid2(options?: { pattern?: RegExp; error?: string | ((_issue: $ZodRawIssue) => string) }) {
  const pattern = options?.pattern ?? CUID2_REGEX
  return z.cuid2({
    pattern: pattern,
    error: typeof options?.error === 'string' ? options?.error : undefined,
    ...(typeof options?.error === 'function' ? { error: options?.error } : {})
  })
}
