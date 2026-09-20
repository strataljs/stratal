import { describe, expect, it } from 'vitest'
import { custom, object, string } from 'zod/mini'
import { describe as describeSchema, named } from '../../i18n/validation/metadata'
import type { ZodType } from '../../i18n/validation/zod'
import type { RouteSchemaMeta } from '../../router/route-metadata'
import { generateOpenAPIDocument } from '../openapi-generator'

const route = (overrides: Partial<RouteSchemaMeta>): RouteSchemaMeta => ({
  method: 'get',
  path: '/test',
  hidden: false,
  tags: [],
  security: [],
  request: {},
  responses: [],
  ...overrides,
})

const buildDoc = (routes: RouteSchemaMeta[]) =>
  generateOpenAPIDocument({ info: { title: 'API', version: '1.0.0' }, routes })

describe('generateOpenAPIDocument unrepresentable types', () => {
  it('emits an empty schema for a custom-typed response instead of throwing', () => {
    const doc = buildDoc([
      route({ responses: [{ status: 200, schema: custom(), contentType: 'application/json', description: 'OK' }] }),
    ])

    const schema = doc.paths['/test'].get!.responses['200']
    expect(schema).toBeDefined()
    expect(() => buildDoc([route({ responses: [{ status: 200, schema: custom(), contentType: 'application/json', description: 'OK' }] })])).not.toThrow()
  })

  it('keeps representable siblings while degrading a nested custom field to any', () => {
    const body = object({ name: string(), payload: custom() }) as unknown as ZodType
    const doc = buildDoc([
      route({ method: 'post', request: { body: { schema: body, contentType: 'application/json' } }, responses: [{ status: 200, schema: string(), contentType: 'application/json', description: 'OK' }] }),
    ])

    const op = doc.paths['/test'].post!
    const content = op.requestBody && 'content' in op.requestBody ? op.requestBody.content['application/json'].schema : undefined
    expect(content).toMatchObject({ type: 'object', properties: { name: { type: 'string' } } })
  })
})

describe('generateOpenAPIDocument parameter metadata', () => {
  it('carries describe() example/description onto the derived path parameter', () => {
    const params = object({
      id: describeSchema(string(), { description: 'The id', example: '1212121' }),
    }) as unknown as ZodType
    const doc = buildDoc([route({ path: '/items/{id}', request: { params } })])

    const param = doc.paths['/items/{id}'].get!.parameters![0]
    expect(param).toMatchObject({
      name: 'id',
      in: 'path',
      required: true,
      schema: { type: 'string', description: 'The id', example: '1212121' },
    })
  })
})

describe('generateOpenAPIDocument named components', () => {
  it('emits the real body for a named schema used directly as a response', () => {
    const user = named(object({ id: string(), name: string() }), 'User') as unknown as ZodType
    const doc = buildDoc([
      route({ responses: [{ status: 200, schema: user, contentType: 'application/json', description: 'OK' }] }),
    ])

    expect(doc.components!.schemas!.User).toMatchObject({
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string' } },
    })
    expect(doc.components!.schemas!.User).not.toHaveProperty('$ref')
  })

  it('emits the real body for a named schema used directly as a request body', () => {
    const createUser = named(object({ name: string() }), 'CreateUser') as unknown as ZodType
    const doc = buildDoc([
      route({ method: 'post', request: { body: { schema: createUser, contentType: 'application/json' } } }),
    ])

    expect(doc.components!.schemas!.CreateUser).toMatchObject({
      type: 'object',
      properties: { name: { type: 'string' } },
    })
    expect(doc.components!.schemas!.CreateUser).not.toHaveProperty('$ref')
  })

  it('still shares one component when a named schema is both nested and top-level', () => {
    const user = named(object({ id: string() }), 'SharedUser') as unknown as ZodType
    const wrapper = object({ data: user as never }) as unknown as ZodType
    const doc = buildDoc([
      route({ path: '/one', responses: [{ status: 200, schema: user, contentType: 'application/json', description: 'OK' }] }),
      route({ path: '/two', responses: [{ status: 200, schema: wrapper, contentType: 'application/json', description: 'OK' }] }),
    ])

    expect(doc.components!.schemas!.SharedUser).toMatchObject({ type: 'object', properties: { id: { type: 'string' } } })

    const one = doc.paths['/one'].get!.responses['200']
    const schema = 'content' in one ? one.content!['application/json'].schema : undefined
    expect(schema).toEqual({ $ref: '#/components/schemas/SharedUser' })
  })
})
