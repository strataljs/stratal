import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computeSchemaFingerprint } from '../test-database'

function schemaFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'strfp-'))
  const f = join(dir, 'schema.prisma')
  writeFileSync(f, 'model User { id Int @id }')
  return f
}

describe('computeSchemaFingerprint', () => {
  it('changes when the prepare hook source changes', () => {
    const f = schemaFile()
    const migrate = () => undefined
    const a = computeSchemaFingerprint(f, migrate, () => undefined)
    const b = computeSchemaFingerprint(f, migrate, () => { void 'seed default tenant' })
    expect(a).not.toBe(b)
  })
  it('is stable when nothing changes', () => {
    const f = schemaFile()
    const migrate = () => undefined
    const prepare = () => undefined
    expect(computeSchemaFingerprint(f, migrate, prepare)).toBe(computeSchemaFingerprint(f, migrate, prepare))
  })
})
