import { z } from '../../i18n/validation'

/**
 * Common OpenAPI Schemas
 *
 * Reusable schema definitions for common API patterns:
 * - Error responses
 * - Pagination
 * - Common parameters
 */

/**
 * Generic error response schema
 * Used for all error responses (4xx, 5xx)
 * Matches ApplicationError.toErrorResponse() structure
 */
export const errorResponseSchema = z.object({
  code: z.number().int().describe('Application error code'),
  message: z.string().describe('Human-readable error message'),
  timestamp: z.string().datetime().describe('ISO timestamp when error occurred'),
  metadata: z.record(z.string(), z.unknown()).optional().describe('Additional error context'),
  stack: z.string().optional().describe('Stack trace (development only)')
}).openapi('ErrorResponse')

/**
 * Validation error response schema
 * Used for 400 Bad Request with validation failures
 * Matches ApplicationError.toErrorResponse() structure with validation-specific metadata
 */
export const validationErrorResponseSchema = z.object({
  code: z.number().int().describe('Application error code'),
  message: z.string().describe('Human-readable error message'),
  timestamp: z.string().datetime().describe('ISO timestamp when error occurred'),
  metadata: z.object({
    issues: z.array(z.object({
      path: z.string().describe('Field path that failed validation'),
      message: z.string().describe('Validation failure message'),
      code: z.string().describe('Zod validation error code')
    }))
  }).describe('Validation error details'),
  stack: z.string().optional().describe('Stack trace (development only)')
}).openapi('ValidationErrorResponse')

/**
 * Pagination query parameters schema
 * Used for list endpoints
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).describe('Page number (1-indexed)'),
  limit: z.coerce.number().int().positive().max(100).default(20).describe('Items per page (max 100)')
}).openapi('PaginationQuery')

/**
 * Paginated response wrapper schema
 * Generic wrapper for paginated list responses
 */
export const paginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema).describe('Array of items for current page'),
    pagination: z.object({
      page: z.number().int().positive().describe('Current page number'),
      limit: z.number().int().positive().describe('Items per page'),
      total: z.number().int().nonnegative().describe('Total number of items'),
      totalPages: z.number().int().nonnegative().describe('Total number of pages')
    })
  })

/**
 * UUID parameter schema
 * Used for :id parameters in RESTful routes
 */
export const uuidParamSchema = z.object({
  id: z.string().uuid().describe('Resource UUID')
}).openapi('UUIDParam')

/**
 * Success message response schema
 * Used for operations that don't return data (e.g., DELETE)
 */
export const successMessageSchema = z.object({
  message: z.string().describe('Success message'),
  data: z.record(z.string(), z.unknown()).optional().describe('Optional additional data')
}).openapi('SuccessMessage')

/**
 * Common HTTP status error schemas
 * Pre-configured for standard error responses
 */
export const commonErrorSchemas = {
  400: { schema: validationErrorResponseSchema, description: 'Validation error' },
  401: { schema: errorResponseSchema, description: 'Unauthorized' },
  403: { schema: errorResponseSchema, description: 'Forbidden' },
  404: { schema: errorResponseSchema, description: 'Not found' },
  409: { schema: errorResponseSchema, description: 'Conflict' },
  500: { schema: errorResponseSchema, description: 'Internal server error' }
} as const
