// Consolidated zod - single source from @hono/zod-openapi (superset of zod)
export { z } from '@hono/zod-openapi'
export type * from 'zod'
export { ZodError } from 'zod'

// OpenAPI utilities
export * from '@hono/zod-openapi'
export type { PathItemObject, OpenAPIObject } from 'openapi3-ts/oas30'

// Helpers
export { withI18n } from './with-i18n'

// Backend utilities
export { runWithErrorMapContext, backendErrorMap } from './validation.context'

// Types
export type { ErrorMapContext, LocaleProvider, I18nErrorMetadata, ZodCustomIssue } from './validation.types'
