import { z, type ZodType } from '../../i18n/validation'

/**
 * Schema for a single hypermedia link
 */
export const hypermediaLinkSchema = z.object({
  href: z.string().describe('URL of the linked resource'),
  method: z.string().optional().describe('HTTP method (defaults to GET)'),
  title: z.string().optional().describe('Human-readable link title'),
  templated: z.boolean().optional().describe('Whether href is a URI template'),
}).openapi('HypermediaLink')

/**
 * Schema for a map of link relations to links
 */
export const linksSchema = z.record(z.string(), hypermediaLinkSchema).openapi('LinkMap')

/**
 * Wraps a data schema in the standard resource envelope
 *
 * @param dataSchema - Schema for the `data` field
 * @returns `{ data: T, _links?: LinkMap, _meta?: object }`
 */
export const resourceResponseSchema = <T extends ZodType>(dataSchema: T) =>
  z.object({
    data: dataSchema.describe('Resource data'),
    _links: linksSchema.optional().describe('Hypermedia links'),
    _meta: z.record(z.string(), z.unknown()).optional().describe('Response metadata'),
  })

/**
 * Wraps an item schema in a paginated resource envelope
 *
 * @param itemSchema - Schema for each item in the `data` array
 * @returns `{ data: T[], _links?: LinkMap, _meta: { page, limit, total, totalPages, ... } }`
 */
export const paginatedResourceSchema = <T extends ZodType>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema).describe('Array of items for current page'),
    _links: linksSchema.optional().describe('Pagination and resource links'),
    _meta: z.object({
      page: z.number().int().positive().describe('Current page number'),
      limit: z.number().int().positive().describe('Items per page'),
      total: z.number().int().nonnegative().describe('Total number of items'),
      totalPages: z.number().int().nonnegative().describe('Total number of pages'),
    }).catchall(z.unknown()).describe('Pagination metadata'),
  })
