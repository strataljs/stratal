import { cuid2 as zodCuid2 } from 'zod/mini'
import { describe, expect, it } from 'vitest'
import { CUID2_REGEX, cuid2 } from '../cuid2'

const VALID_CUID2 = 'k8e1z9v8c7w0r3xq4y5n6t1d' // 24 chars, lowercase, leading letter

describe('cuid2()', () => {
  it('accepts a real cuid2', async () => {
    expect((await cuid2().safeParseAsync(VALID_CUID2)).success).toBe(true)
  })

  it('rejects strings that pass z.cuid2() but are not real cuid2 — the gap this helper closes', async () => {
    // Zod 4.3.6's `z.cuid2()` accepts these (regex `/^[0-9a-z]+$/`).
    // The helper's added shape regex rejects them.
    for (const value of ['sw', 'a', '0', 'short']) {
      expect((await zodCuid2().safeParseAsync(value)).success).toBe(true)
      expect((await cuid2().safeParseAsync(value)).success).toBe(false)
    }
  })

  it('rejects strings z.cuid2() also rejects (uppercase, hyphens, empty)', async () => {
    for (const value of ['UPPERCASE', 'has-hyphens', '']) {
      expect((await cuid2().safeParseAsync(value)).success).toBe(false)
    }
  })

  it('preserves the OpenAPI cuid2 format metadata from z.cuid2()', () => {
    // Internal Zod field — confirms the chain begins with a real
    // `z.cuid2()` so spec generation still emits `format: cuid2`.
    const def = (cuid2() as unknown as { _zod: { def: { format?: string } } })._zod.def
    expect(def.format).toBe('cuid2')
  })

  it('accepts a custom pattern override', async () => {
    const fixed24 = cuid2({ pattern: /^[a-z][0-9a-z]{23}$/ })
    expect((await fixed24.safeParseAsync(VALID_CUID2)).success).toBe(true)
    // 25 chars — passes default but rejected by fixed-length override
    expect((await fixed24.safeParseAsync(`${VALID_CUID2}x`)).success).toBe(false)
    expect((await cuid2().safeParseAsync(`${VALID_CUID2}x`)).success).toBe(true)
  })

  it('accepts a custom error message', async () => {
    const result = await cuid2({ error: 'tenants.errors.invalidId' }).safeParseAsync('sw')
    expect(result.success).toBe(false)
    if (!result.success) {
      // The injected message lives on the regex check (the second issue).
      const messages = result.error.issues.map(i => i.message)
      expect(messages).toContain('tenants.errors.invalidId')
    }
  })

  it('CUID2_REGEX is exported and reusable', () => {
    expect(CUID2_REGEX.test(VALID_CUID2)).toBe(true)
    expect(CUID2_REGEX.test('sw')).toBe(false)
  })
})
