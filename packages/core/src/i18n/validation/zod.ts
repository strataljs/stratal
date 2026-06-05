// Consolidated zod - single source from @hono/zod-openapi (superset of zod)
export { OpenAPIHono, z } from '@hono/zod-openapi'
export type * from 'zod'
export { ZodError } from 'zod'

// OpenAPI utilities
export * from '@hono/zod-openapi'
export type { OpenAPIObject, PathItemObject } from 'openapi3-ts/oas30'

// Helpers
export { CUID2_REGEX, cuid2 } from './cuid2'

// Types
export type { I18nErrorMetadata, ZodCustomIssue } from './validation.types'
