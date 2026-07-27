import { describe, expect, it } from 'vitest'
import { custom, object, string } from 'zod/mini'
import { describe as describeSchema } from '../../i18n/validation/metadata'
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
