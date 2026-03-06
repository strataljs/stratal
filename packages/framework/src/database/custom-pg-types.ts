import { types as pgTypes } from 'pg'
import { parse as parseArray } from 'postgres-array'

/**
 * Custom pg types that auto-parse PostgreSQL array literals.
 *
 * pg-types handles known array types (text[], int[], etc.) but not
 * custom enum arrays which have database-specific OIDs. This wrapper
 * detects unparsed array strings and parses them automatically.
 *
 * @example
 * ```typescript
 * import { customPgTypes } from '@stratal/framework/database';
 *
 * const pool = new Pool({
 *   connectionString,
 *   types: customPgTypes
 * });
 * ```
 */
export const customPgTypes = {
  getTypeParser: (oid: number, format?: 'text' | 'binary') => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const defaultParser = pgTypes.getTypeParser(oid, format)

    return (val: string) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const result = defaultParser(val)

      // If result is a string that looks like a PostgreSQL array, parse it
      // This handles custom enum arrays that pg-types doesn't know about
      // Exclude JSON objects (start with `{"`) - only parse actual PostgreSQL arrays
      if (typeof result === 'string' &&
          result.startsWith('{') &&
          result.endsWith('}') &&
          !result.startsWith('{"')) {
        return parseArray(result)
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return result
    }
  }
}
