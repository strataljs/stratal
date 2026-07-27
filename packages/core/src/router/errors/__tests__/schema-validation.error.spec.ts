import { number, object, string } from 'zod/mini'
import { describe, expect, it } from 'vitest'
import { SchemaValidationError } from '../schema-validation.error'

const schema = object({
  name: string(),
  age: number(),
})

describe('SchemaValidationError', () => {
  it('should have httpStatus 400', () => {
    const result = schema.safeParse({ name: 123, age: 'nope' })
    if (result.success) throw new Error('expected validation to fail')

    const error = new SchemaValidationError(result.error)
    expect(error.httpStatus).toBe(400)
  })

  it('should map ZodError issues to the issues property', () => {
    const result = schema.safeParse({ name: 123, age: 'nope' })
    if (result.success) throw new Error('expected validation to fail')

    const error = new SchemaValidationError(result.error)
    expect(error.issues).toHaveLength(2)
    expect(error.issues[0].path).toBe('name')
    expect(error.issues[1].path).toBe('age')
    expect(error.issues[0]).toMatchObject({ path: 'name', code: expect.any(String) })
  })

  it('should expose its issues to the log entry via reportContext', () => {
    const result = schema.safeParse({ name: 123, age: 'nope' })
    if (result.success) throw new Error('expected validation to fail')

    const error = new SchemaValidationError(result.error)
    expect(error.reportContext()).toEqual({ issues: error.issues })
  })
})
