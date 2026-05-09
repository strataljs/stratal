import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { LocalePrefixCatchallAppModule } from '../fixtures/locale-prefix-catchall.controller'

/**
 * Regression spec: a primary route with a wildcard param (`/:slug{.+}`) used
 * to "win" against its locale variant for locale-prefixed URLs because Stratal
 * sorted primaries before locale variants. Hono picks the first registered
 * matcher when both match, so `/sw/applications/123` was being captured as
 * `slug='sw/applications/123'` on the primary instead of locale='sw' +
 * slug='applications/123' on the variant.
 *
 * After fixing the sort to register variants ahead of their primary, the
 * variant matches first for locale-prefixed URLs while the primary still
 * matches every unprefixed URL.
 */
describe('Locale-prefixed URLs against a primary catch-all', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [LocalePrefixCatchallAppModule],
    }).compile()
  })

  afterAll(async () => {
    await module.close()
  })

  it('matches the primary catch-all for unprefixed URLs', async () => {
    const response = await module.http.get('/applications/123').send()
    response.assertOk()
    await response.assertJsonPath('slug', 'applications/123')
    await response.assertJsonPath('locale', 'en')
  })

  it('matches the locale variant — the catch-all does NOT swallow the locale prefix', async () => {
    const response = await module.http.get('/sw/applications/123').send()
    response.assertOk()
    await response.assertJsonPath('slug', 'applications/123')
    await response.assertJsonPath('locale', 'sw')
  })

  it('handles deep nested catch-all paths under the locale variant', async () => {
    const response = await module.http.get('/sw/auth/login').send()
    response.assertOk()
    await response.assertJsonPath('slug', 'auth/login')
    await response.assertJsonPath('locale', 'sw')
  })

  it('falls back to the primary when the leading segment is not a known locale', async () => {
    const response = await module.http.get('/fr/anything').send()
    response.assertOk()
    // 'fr' is not in the configured locales (en, sw) — variant constraint
    // rejects it, so the primary catch-all captures the whole path.
    await response.assertJsonPath('slug', 'fr/anything')
    await response.assertJsonPath('locale', 'en')
  })
})
