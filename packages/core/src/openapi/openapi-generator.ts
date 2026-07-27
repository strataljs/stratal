import type {
    ComponentsObject,
    OpenAPIObject,
    OperationObject,
    ParameterObject,
    PathItemObject,
    ReferenceObject,
    ResponseObject,
    ResponsesObject,
    SchemaObject,
} from 'openapi3-ts/oas30';
import type { ZodMiniType as ZodType } from 'zod/mini';
import { globalRegistry, toJSONSchema } from 'zod/mini';
import type { RouteSchemaMeta } from '../router/route-metadata';

/**
 * Inputs for a single document build. `filter` scopes which routes appear:
 * callers pass a predicate over the route metadata (groups, path, method,
 * security) instead of imperatively mutating shared config.
 */
export interface OpenAPIDocumentInput {
  info: { title: string; version: string; description?: string }
  routes: readonly RouteSchemaMeta[]
  securitySchemes?: ComponentsObject['securitySchemes']
  servers?: { url: string }[]
  filter?: (route: RouteSchemaMeta) => boolean
}

// Definition containers differ by JSON Schema draft: draft-07 emits
// `definitions`, draft-2020 emits `$defs`. Both map to OpenAPI components.
const REF_FROM = ['#/definitions/', '#/$defs/']
const REF_TO = '#/components/schemas/'

/**
 * Build an OpenAPI 3.0 document on demand from collected route metadata using
 * zod v4's native `z.toJSONSchema()` — no `@hono/zod-openapi` /
 * `@asteasolutions/zod-to-openapi`. This module is only ever loaded via dynamic
 * import from the docs endpoint, so `zod` never reaches the routing-init path.
 */
export function generateOpenAPIDocument(input: OpenAPIDocumentInput): OpenAPIObject {
  const paths: Record<string, PathItemObject> = {}
  const components: Record<string, SchemaObject> = {}

  for (const route of input.routes) {
    if (route.hidden) continue
    if (input.filter && !input.filter(route)) continue

    const operation = buildOperation(route, components)
    const pathItem = (paths[route.path] ??= {})
    ;(pathItem as Record<string, OperationObject>)[route.method] = operation
  }

  const doc: OpenAPIObject = {
    openapi: '3.0.0',
    info: input.info,
    paths,
  }
  if (input.servers?.length) doc.servers = input.servers
  if (input.securitySchemes || Object.keys(components).length > 0) {
    doc.components = {}
    if (input.securitySchemes) doc.components.securitySchemes = input.securitySchemes
    if (Object.keys(components).length > 0) doc.components.schemas = components
  }
  return doc
}

function buildOperation(route: RouteSchemaMeta, components: Record<string, SchemaObject>): OperationObject {
  const operation: OperationObject = { responses: buildResponses(route, components) }

  if (route.tags.length) operation.tags = route.tags
  if (route.summary) operation.summary = route.summary
  if (route.description) operation.description = route.description
  if (route.security.length) operation.security = route.security

  const parameters = buildParameters(route, components)
  if (parameters.length) operation.parameters = parameters

  if (route.request.body) {
    const schema = convert(route.request.body.schema, 'input', components)
    operation.requestBody = {
      required: true,
      content: { [route.request.body.contentType]: { schema } },
    }
  }

  return operation
}

function buildParameters(route: RouteSchemaMeta, components: Record<string, SchemaObject>): ParameterObject[] {
  const parameters: ParameterObject[] = []

  if (route.localeParam) {
    parameters.push({
      name: route.localeParam.name,
      in: 'path',
      required: true,
      schema: { type: 'string', enum: route.localeParam.values },
    })
  }
  if (route.request.params) {
    parameters.push(...expandObjectParams(route.request.params, 'path', components))
  }
  if (route.request.query) {
    parameters.push(...expandObjectParams(route.request.query, 'query', components))
  }

  return parameters
}

/** Split a zod object schema into individual OpenAPI parameter objects. */
function expandObjectParams(schema: ZodType, location: 'path' | 'query', components: Record<string, SchemaObject>): ParameterObject[] {
  // Always inline: OpenAPI parameters are split per-property and cannot be a
  // `$ref` to the whole object, even when that object is a named component.
  const json = convertInline(schema, 'input', components)
  if (json.type !== 'object' || !json.properties) return []

  const required = new Set(json.required ?? [])
  return Object.entries(json.properties).map(([name, propSchema]) => ({
    name,
    in: location,
    // Path params are always required; query follows the schema.
    required: location === 'path' ? true : required.has(name),
    schema: propSchema as SchemaObject,
  }))
}

function buildResponses(route: RouteSchemaMeta, components: Record<string, SchemaObject>): ResponsesObject {
  const responses: ResponsesObject = {}
  for (const res of route.responses) {
    const entry: ResponseObject = { description: res.description }
    if (res.schema) {
      entry.content = { [res.contentType]: { schema: convert(res.schema, 'output', components) } }
    }
    responses[String(res.status)] = entry
  }
  return responses
}

/**
 * Convert one zod schema to an OpenAPI 3.0 schema object. Schemas registered
 * with an `id` (via the global registry) are emitted once into the shared
 * components map and referenced with `$ref` — both when they appear nested (zod
 * extracts them to `definitions`) and when passed at the top level.
 */
function convert(schema: ZodType, io: 'input' | 'output', components: Record<string, SchemaObject>): SchemaObject | ReferenceObject {
  const id = globalRegistry.get(schema)?.id
  if (id) {
    if (!(id in components)) {
      components[id] = {} // placeholder breaks recursion before the body is built
      components[id] = convertInline(schema, io, components)
    }
    return { $ref: REF_TO + id }
  }
  return convertInline(schema, io, components)
}

/** Convert a schema inline, hoisting any reused `$defs` into shared components. */
function convertInline(schema: ZodType, io: 'input' | 'output', components: Record<string, SchemaObject>): SchemaObject {
  // Types with no JSON Schema representation (custom, transform, function, map,
  // set, etc.) emit an empty schema ("any") instead of aborting the document.
  const json = toJSONSchema(schema, { io, target: 'openapi-3.0', reused: 'ref', unrepresentable: 'any' }) as Record<string, unknown>
  delete json.$schema

  const defs = (json.definitions ?? json.$defs) as Record<string, unknown> | undefined
  if (defs) {
    delete json.definitions
    delete json.$defs
    for (const [name, def] of Object.entries(defs)) {
      components[name] ??= rewriteRefs(def) as SchemaObject
    }
  }
  return rewriteRefs(json) as SchemaObject
}

/** Rewrite JSON-Schema `#/definitions/x` and `#/$defs/x` refs to OpenAPI `#/components/schemas/x`. */
function rewriteRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewriteRefs)
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out[key] = key === '$ref' && typeof value === 'string'
        ? REF_FROM.reduce((ref, from) => ref.replace(from, REF_TO), value)
        : rewriteRefs(value)
    }
    return out
  }
  return node
}
