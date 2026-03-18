import { describe, expect, it } from 'vitest'
import { generateUsage } from '../usage-generator'
import { parseSignature } from '../signature-parser'

describe('generateUsage', () => {
  it('should generate usage for a simple command', () => {
    const sig = parseSignature('greet')
    const usage = generateUsage(sig, 'Greet someone')

    expect(usage).toContain('Usage: quarry greet')
    expect(usage).toContain('Greet someone')
  })

  it('should show required arguments in angle brackets', () => {
    const sig = parseSignature('greet {name}')
    const usage = generateUsage(sig)

    expect(usage).toContain('<name>')
    expect(usage).toContain('(required)')
  })

  it('should show optional arguments in square brackets', () => {
    const sig = parseSignature('greet {name?}')
    const usage = generateUsage(sig)

    expect(usage).toContain('[name]')
    expect(usage).toContain('(optional)')
  })

  it('should show argument defaults', () => {
    const sig = parseSignature('greet {name=World}')
    const usage = generateUsage(sig)

    expect(usage).toContain('[name]')
    expect(usage).toContain('(default: World)')
  })

  it('should show variadic arguments', () => {
    const sig = parseSignature('install {packages*}')
    const usage = generateUsage(sig)

    expect(usage).toContain('<packages...>')
    expect(usage).toContain('(variadic)')
  })

  it('should show argument descriptions', () => {
    const sig = parseSignature('greet {name : The name to greet}')
    const usage = generateUsage(sig)

    expect(usage).toContain('The name to greet')
  })

  it('should show boolean flags', () => {
    const sig = parseSignature('greet {--loud}')
    const usage = generateUsage(sig)

    expect(usage).toContain('[--loud]')
    expect(usage).toContain('Boolean flag')
  })

  it('should show value options', () => {
    const sig = parseSignature('greet {--greeting=}')
    const usage = generateUsage(sig)

    expect(usage).toContain('[--greeting <value>]')
  })

  it('should show option aliases', () => {
    const sig = parseSignature('greet {--L|loud}')
    const usage = generateUsage(sig)

    expect(usage).toContain('[-L,--loud]')
    expect(usage).toContain('-L,')
  })

  it('should show option descriptions', () => {
    const sig = parseSignature('greet {--G|greeting= : The greeting to use}')
    const usage = generateUsage(sig)

    expect(usage).toContain('The greeting to use')
  })

  it('should show option defaults', () => {
    const sig = parseSignature('greet {--greeting=Hello}')
    const usage = generateUsage(sig)

    expect(usage).toContain('(default: Hello)')
  })

  it('should show array options', () => {
    const sig = parseSignature('greet {--tag=*}')
    const usage = generateUsage(sig)

    expect(usage).toContain('[--tag <value...>]')
    expect(usage).toContain('(multiple)')
  })

  it('should generate complete usage for a complex command', () => {
    const sig = parseSignature('users:create {email : The user email} {--A|admin} {--R|role= : Assign a role}')
    const usage = generateUsage(sig, 'Create a new user')

    expect(usage).toContain('Usage: quarry users:create')
    expect(usage).toContain('Create a new user')
    expect(usage).toContain('<email>')
    expect(usage).toContain('The user email')
    expect(usage).toContain('-A,')
    expect(usage).toContain('--admin')
    expect(usage).toContain('-R,')
    expect(usage).toContain('--role')
    expect(usage).toContain('Assign a role')
  })
})
