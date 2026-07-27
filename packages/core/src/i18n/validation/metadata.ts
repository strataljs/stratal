import { globalRegistry } from 'zod/mini'
import type { GlobalMeta, ZodType } from './zod'

/**
 * Schema metadata read by the OpenAPI generator: `description`, `title`,
 * `example`, `examples`, `deprecated`, and any extra keys zod passes through to
 * the generated JSON Schema.
 */
export type SchemaMeta = GlobalMeta

/** A bare description string, or a full metadata object. */
export type SchemaMetaInput = string | SchemaMeta

const toMeta = (input: SchemaMetaInput): SchemaMeta =>
  typeof input === 'string' ? { description: input } : input

/**
 * Attach metadata to a schema. zod/mini has no chainable `.describe()`, so
 * metadata is registered in the global registry; the OpenAPI generator reads it
 * back when building the document. Pass a string for a description only, or an
 * object to set `example`, `examples`, `title`, `deprecated`, etc.
 *
 * @example
 * ```ts
 * import { string } from 'zod/mini'
 * import { describe } from 'stratal/validation'
 *
 * const name = describe(string(), 'The display name')
 * const id = describe(string(), { description: 'The id', example: '1212121' })
 * ```
 */
export function describe<T extends ZodType>(schema: T, meta: SchemaMetaInput): T {
  globalRegistry.add(schema, toMeta(meta))
  return schema
}

/**
 * Register a schema as a reusable OpenAPI component. The generator emits it once
 * under `components.schemas.<id>` and references it with `$ref` everywhere it is
 * used. Pass a string for a description only, or an object for further metadata;
 * the explicit `id` always wins.
 *
 * @example
 * ```ts
 * import { object, string } from 'zod/mini'
 * import { named } from 'stratal/validation'
 *
 * const User = named(object({ id: string() }), 'User', 'A user record')
 * const Money = named(object({ cents: number() }), 'Money', { example: { cents: 500 } })
 * ```
 */
export function named<T extends ZodType>(schema: T, id: string, meta?: SchemaMetaInput): T {
  globalRegistry.add(schema, meta === undefined ? { id } : { ...toMeta(meta), id })
  return schema
}
