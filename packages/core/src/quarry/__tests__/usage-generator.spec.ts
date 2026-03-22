import { describe, expect, it } from 'vitest'
import { generateListing, generateUsage } from '../usage-generator'
import { parseSignature } from '../signature-parser'

describe('generateUsage', () => {
  it('should generate usage for a simple command', () => {
    const sig = parseSignature('greet')
    const usage = generateUsage(sig, 'Greet someone')

    expect(usage).toContain('quarry greet')
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

  it('should show argument defaults in usage line', () => {
    const sig = parseSignature('greet {name=World}')
    const usage = generateUsage(sig)

    expect(usage).toContain('[name=World]')
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

    expect(usage).toContain('quarry users:create')
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

describe('generateListing', () => {
  it('should show header with label and version', () => {
    const listing = generateListing([], new Map(), {
      binaryLabel: 'Quarry CLI',
      binaryVersion: '1.2.3',
    })

    expect(listing).toContain('Quarry CLI')
    expect(listing).toContain('v1.2.3')
  })

  it('should show "No registered commands." when empty', () => {
    const listing = generateListing([], new Map())

    expect(listing).toContain('No registered commands.')
  })

  it('should show commands with descriptions below the signature', () => {
    const sig1 = parseSignature('db:seed {names*} {--A|all} {--dry-run}')
    const sig2 = parseSignature('db:seed:list')

    const signatures = new Map([
      ['db:seed', sig1],
      ['db:seed:list', sig2],
    ])

    const commands = [
      { name: 'db:seed', description: 'Run database seeders', aliases: [] },
      { name: 'db:seed:list', description: 'List available database seeders', aliases: [] },
    ]

    const listing = generateListing(commands, signatures, { binaryName: 'quarry' })
    const lines = listing.split('\n')

    // Signature on its own line, description on the next (4-space indent)
    const seedLine = lines.findIndex((l) => l.includes('db:seed') && l.includes('<names...>'))
    expect(seedLine).toBeGreaterThan(-1)
    expect(lines[seedLine + 1]).toMatch(/^\s{4}.*Run database seeders/)

    const listLine = lines.findIndex((l) => l.includes('db:seed:list'))
    expect(listLine).toBeGreaterThan(-1)
    expect(lines[listLine + 1]).toMatch(/^\s{4}.*List available database seeders/)

    // Blank line between commands
    expect(lines[seedLine + 2]).toBe('')
  })

  it('should show positional args with defaults in compact listing', () => {
    const sig = parseSignature('publish {destination=db/central/schema.zmodel} {--force}')
    const signatures = new Map([['publish', sig]])
    const commands = [{ name: 'publish', description: 'Publish schema', aliases: [] }]

    const listing = generateListing(commands, signatures)

    expect(listing).toContain('[destination=db/central/schema.zmodel]')
  })

  it('should show aliases inline', () => {
    const sig = parseSignature('db:seed {names*}')
    const signatures = new Map([['db:seed', sig]])
    const commands = [{ name: 'db:seed', description: 'Run seeders', aliases: ['seed'] }]

    const listing = generateListing(commands, signatures)

    expect(listing).toContain('(alias: seed)')
  })

  it('should wrap long signatures at continuation indent on narrow terminals', () => {
    const sig = parseSignature('tenancy:install {destination=db/central/schema.zmodel} {--force}')
    const signatures = new Map([['tenancy:install', sig]])
    const commands = [{ name: 'tenancy:install', description: 'Publish the tenant schema file', aliases: [] }]

    // Temporarily narrow the terminal
    const original = process.stdout.columns
    process.stdout.columns = 40
    try {
      const listing = generateListing(commands, signatures)
      const lines = listing.split('\n')
      const sigStart = lines.findIndex((l) => l.includes('tenancy:install'))
      expect(sigStart).toBeGreaterThan(-1)

      // The continuation line should start with 6-space indent
      const continuationLine = lines[sigStart + 1]
      expect(continuationLine).toMatch(/^\s{6}/)
    } finally {
      process.stdout.columns = original
    }
  })

  it('should default to 80 columns when process.stdout.columns is undefined', () => {
    const sig = parseSignature('short')
    const signatures = new Map([['short', sig]])
    const commands = [{ name: 'short', description: 'A short command', aliases: [] }]

    const original = process.stdout.columns
    delete (process.stdout as unknown as Record<string, unknown>).columns
    try {
      const listing = generateListing(commands, signatures)
      // Should not throw and should contain the command on a single line
      expect(listing).toContain('short')
      expect(listing).toContain('A short command')
    } finally {
      process.stdout.columns = original
    }
  })

  it('should show footer hint with binary name', () => {
    const sig = parseSignature('greet')
    const signatures = new Map([['greet', sig]])
    const commands = [{ name: 'greet', description: 'Say hello', aliases: [] }]

    const listing = generateListing(commands, signatures, { binaryName: 'mycli' })

    expect(listing).toContain('Run mycli help <command> for detailed information.')
  })

  it('should show Usage section with binary name', () => {
    const listing = generateListing([], new Map(), { binaryName: 'mycli' })

    expect(listing).toContain('$ mycli <command> [options]')
  })
})
