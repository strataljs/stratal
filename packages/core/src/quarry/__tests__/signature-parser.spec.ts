import { describe, expect, it } from 'vitest'
import { parseSignature } from '../signature-parser'

describe('parseSignature', () => {
  it('should parse a simple command name', () => {
    const result = parseSignature('greet')
    expect(result.name).toBe('greet')
    expect(result.arguments).toHaveLength(0)
    expect(result.options).toHaveLength(0)
  })

  it('should parse a namespaced command name', () => {
    const result = parseSignature('users:create')
    expect(result.name).toBe('users:create')
  })

  it('should parse a dotted command name', () => {
    const result = parseSignature('db.migrate')
    expect(result.name).toBe('db.migrate')
  })

  // ── Arguments ────────────────────────────────────────────────────

  it('should parse a required argument', () => {
    const result = parseSignature('greet {name}')
    expect(result.arguments).toHaveLength(1)
    expect(result.arguments[0]).toEqual({
      name: 'name',
      required: true,
      isArray: false,
    })
  })

  it('should parse an optional argument', () => {
    const result = parseSignature('greet {name?}')
    expect(result.arguments).toHaveLength(1)
    expect(result.arguments[0]).toEqual({
      name: 'name',
      required: false,
      isArray: false,
    })
  })

  it('should parse an argument with default value', () => {
    const result = parseSignature('greet {name=World}')
    expect(result.arguments).toHaveLength(1)
    expect(result.arguments[0]).toEqual({
      name: 'name',
      required: false,
      default: 'World',
      isArray: false,
    })
  })

  it('should parse a variadic/array argument', () => {
    const result = parseSignature('install {packages*}')
    expect(result.arguments).toHaveLength(1)
    expect(result.arguments[0]).toEqual({
      name: 'packages',
      required: true,
      isArray: true,
    })
  })

  it('should parse an argument with description', () => {
    const result = parseSignature('greet {name : The name to greet}')
    expect(result.arguments).toHaveLength(1)
    expect(result.arguments[0]).toEqual({
      name: 'name',
      required: true,
      isArray: false,
      description: 'The name to greet',
    })
  })

  it('should parse an optional argument with description', () => {
    const result = parseSignature('greet {name? : The name to greet}')
    expect(result.arguments[0]).toEqual({
      name: 'name',
      required: false,
      isArray: false,
      description: 'The name to greet',
    })
  })

  // ── Options ──────────────────────────────────────────────────────

  it('should parse a boolean flag', () => {
    const result = parseSignature('greet {--loud}')
    expect(result.options).toHaveLength(1)
    expect(result.options[0]).toEqual({
      name: 'loud',
      isFlag: true,
      isArray: false,
    })
  })

  it('should parse an option that accepts a value', () => {
    const result = parseSignature('greet {--greeting=}')
    expect(result.options).toHaveLength(1)
    expect(result.options[0]).toEqual({
      name: 'greeting',
      isFlag: false,
      isArray: false,
    })
  })

  it('should parse an option with default value', () => {
    const result = parseSignature('greet {--greeting=Hello}')
    expect(result.options).toHaveLength(1)
    expect(result.options[0]).toEqual({
      name: 'greeting',
      isFlag: false,
      isArray: false,
      default: 'Hello',
    })
  })

  it('should parse an array option', () => {
    const result = parseSignature('greet {--tag=*}')
    expect(result.options).toHaveLength(1)
    expect(result.options[0]).toEqual({
      name: 'tag',
      isFlag: false,
      isArray: true,
    })
  })

  it('should parse an option with alias', () => {
    const result = parseSignature('greet {--L|loud}')
    expect(result.options).toHaveLength(1)
    expect(result.options[0]).toEqual({
      name: 'loud',
      alias: 'L',
      isFlag: true,
      isArray: false,
    })
  })

  it('should parse an option with alias and value', () => {
    const result = parseSignature('users:create {--R|role=}')
    expect(result.options[0]).toEqual({
      name: 'role',
      alias: 'R',
      isFlag: false,
      isArray: false,
    })
  })

  it('should parse an option with description', () => {
    const result = parseSignature('greet {--greeting= : The greeting to use}')
    expect(result.options[0]).toEqual({
      name: 'greeting',
      isFlag: false,
      isArray: false,
      description: 'The greeting to use',
    })
  })

  it('should parse an option with alias and description', () => {
    const result = parseSignature('greet {--G|greeting= : The greeting to use}')
    expect(result.options[0]).toEqual({
      name: 'greeting',
      alias: 'G',
      isFlag: false,
      isArray: false,
      description: 'The greeting to use',
    })
  })

  // ── Complex Signatures ──────────────────────────────────────────

  it('should parse a full signature with multiple args and options', () => {
    const result = parseSignature('users:create {email : The user email} {--A|admin} {--R|role= : Assign a role}')

    expect(result.name).toBe('users:create')

    expect(result.arguments).toHaveLength(1)
    expect(result.arguments[0]).toEqual({
      name: 'email',
      required: true,
      isArray: false,
      description: 'The user email',
    })

    expect(result.options).toHaveLength(2)
    expect(result.options[0]).toEqual({
      name: 'admin',
      alias: 'A',
      isFlag: true,
      isArray: false,
    })
    expect(result.options[1]).toEqual({
      name: 'role',
      alias: 'R',
      isFlag: false,
      isArray: false,
      description: 'Assign a role',
    })
  })

  it('should parse signature with multiple arguments', () => {
    const result = parseSignature('copy {source} {destination} {--force}')

    expect(result.arguments).toHaveLength(2)
    expect(result.arguments[0].name).toBe('source')
    expect(result.arguments[1].name).toBe('destination')
    expect(result.options).toHaveLength(1)
    expect(result.options[0].name).toBe('force')
  })

  it('should throw on invalid signature with no command name', () => {
    expect(() => parseSignature('')).toThrow('Invalid signature')
    expect(() => parseSignature('{arg}')).toThrow('Invalid signature')
  })
})
