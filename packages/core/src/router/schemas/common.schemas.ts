import {
  array,
  coerce,
  int,
  iso,
  maximum,
  nonnegative,
  number,
  object,
  optional,
  positive,
  record,
  string,
  unknown,
  uuid,
  _default,
} from 'zod/mini'
import { describe, named } from '../../i18n/validation/metadata'
import type { ZodType } from '../../i18n/validation/zod'

/**
 * Common OpenAPI Schemas
 *
 * Reusable schema definitions for common API patterns (error responses,
 * pagination, common parameters). Consumed by the lazy OpenAPI generator —
 * never imported on the routing hot path — so these never reach a running
 * worker unless the OpenAPI document is actually requested.
 *
 * Metadata (descriptions, component ids) is attached via the shared registry
 * helpers; the generator reads `id` to emit shared `components.schemas` entries
 * and `description` for field docs.
 */

/**
 * Generic error response schema. Matches the ErrorResponse shape produced by
 * ExceptionHandler. Used for all error responses (4xx, 5xx).
 */
export const errorResponseSchema = named(
  object({
    message: describe(string(), 'Human-readable error message'),
    timestamp: describe(iso.datetime(), 'ISO timestamp when error occurred'),
    stack: describe(optional(string()), 'Stack trace (development only)'),
  }),
  'ErrorResponse',
  'Error response',
)

/** Validation error response schema (400 Bad Request). Shares the ErrorResponse shape. */
export const validationErrorResponseSchema = errorResponseSchema

/** Pagination query parameters for list endpoints. */
export const paginationQuerySchema = named(
  object({
    page: describe(_default(coerce.number().check(int(), positive()), 1), 'Page number (1-indexed)'),
    limit: describe(_default(coerce.number().check(int(), positive(), maximum(100)), 20), 'Items per page (max 100)'),
  }),
  'PaginationQuery',
  'Pagination query parameters',
)

/** Generic wrapper for paginated list responses. */
export const paginatedResponseSchema = <T extends ZodType>(itemSchema: T) =>
  object({
    data: describe(array(itemSchema), 'Array of items for current page'),
    pagination: object({
      page: describe(number().check(int(), positive()), 'Current page number'),
      limit: describe(number().check(int(), positive()), 'Items per page'),
      total: describe(number().check(int(), nonnegative()), 'Total number of items'),
      totalPages: describe(number().check(int(), nonnegative()), 'Total number of pages'),
    }),
  })

/** UUID parameter schema for `:id` parameters in RESTful routes. */
export const uuidParamSchema = named(
  object({ id: describe(uuid(), 'Resource UUID') }),
  'UUIDParam',
  'UUID path parameter',
)

/** Success message response for operations that don't return data (e.g. DELETE). */
export const successMessageSchema = named(
  object({
    message: describe(string(), 'Success message'),
    data: describe(optional(record(string(), unknown())), 'Optional additional data'),
  }),
  'SuccessMessage',
  'Success message',
)

/** Pre-configured error response schemas keyed by standard HTTP status. */
export const commonErrorSchemas = {
  400: { schema: validationErrorResponseSchema, description: 'Validation error' },
  401: { schema: errorResponseSchema, description: 'Unauthorized' },
  403: { schema: errorResponseSchema, description: 'Forbidden' },
  404: { schema: errorResponseSchema, description: 'Not found' },
  409: { schema: errorResponseSchema, description: 'Conflict' },
  500: { schema: errorResponseSchema, description: 'Internal server error' },
} as const
