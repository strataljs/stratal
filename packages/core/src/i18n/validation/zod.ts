// Validation type surface. There is no runtime `z` re-export: consumers import
// schema builders directly from `zod/mini` (named imports keep them
// tree-shakeable). The old re-export existed only to share one zod instance
// with `@hono/zod-openapi`, which the framework no longer uses.
//
// `ZodType` is any schema (carries `.safeParse`); `ZodObject` additionally
// exposes `.shape` for prefix/param composition.
export type { ZodMiniObject as ZodObject, ZodMiniType as ZodType } from 'zod/mini'

// Error types live in zod core (shared by classic and mini).
export type { $ZodError as ZodError, $ZodIssue } from 'zod/v4/core'

// Schema metadata accepted by the global registry (id, title, description,
// example, examples, deprecated, and arbitrary extra keys).
export type { GlobalMeta } from 'zod/v4/core'

// OpenAPI document types (pure types — erased at build).
export type { OpenAPIObject, PathItemObject } from 'openapi3-ts/oas30'

// Helpers
export { CUID2_REGEX, cuid2 } from './cuid2'

// Types
export type { I18nErrorMetadata, ZodCustomIssue } from './validation.types'
