// Consolidated zod - single source from @hono/zod-openapi (superset of zod)
export { OpenAPIHono, z } from '@hono/zod-openapi'
export type * from 'zod'
export { ZodError } from 'zod'

// OpenAPI utilities
export * from '@hono/zod-openapi'
export type { OpenAPIObject, PathItemObject } from 'openapi3-ts/oas30'

// Helpers
export { withI18n } from './with-i18n'
export { CUID2_REGEX, cuid2 } from './cuid2'

// Backend utilities
export { backendErrorMap, runWithErrorMapContext } from './validation.context'

// Types
export type { ErrorMapContext, I18nErrorMetadata, LocaleProvider, ZodCustomIssue } from './validation.types'

