import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { HonoApp } from '../../src/router/hono-app'
import type { RouteRegistry } from '../../src/router/route-registry'
import { ROUTER_TOKENS } from '../../src/router/router.tokens'
import {
  LocalePrefixAppModule,
  LocalePrefixStrictAppModule,
} from '../fixtures/locale-prefix.controller'

const VALID_CUID2 = 'k8e1z9v8c7w0r3xq4y5n6t1d'

/**
 * Regression spec for two interacting bugs that surfaced together when path
 * locale detection runs alongside a `Router.prefix(path, schema)` carrying
 * a `z.cuid2()` schema:
 *
 *   1. **Prototype mutation** — `RouteRegistrationService.collectRoutes` was
 *      mutating `meta.config.params` (the route-level metadata stored on the
 *      controller's prototype) when injecting prefix-level params. Across
 *      multiple Application instances that touch the same controller class
 *      (e.g. successive integration tests), the second instance saw a stale
 *      schema cached by the first and registered its own routes with that
 *      stale schema. Fixed by computing the merged schema locally and
 *      passing a shallow-cloned `routeConfig` downstream — `meta.config` is
 *      never mutated.
 *
 *   2. **Permissive `z.cuid2()` regex** — Zod 4.3.6's `cuid2()` validator
 *      uses `/^[0-9a-z]+$/`, which accepts any non-empty lowercase-
 *      alphanumeric string. It does not enforce cuid2's length / "starts
 *      with letter" requirements. So `'sw'` (a locale prefix) passes
 *      `z.cuid2()` validation. The fix lives in user code: use a stricter
 *      shape regex when you need cuid2-shaped tenant ids. The strict
 *      describe block below shows it works.
 */
describe('Prefix `params` validation under locale-path detection', () => {
  describe('with z.cuid2() — permissive due to Zod 4.3.6 regex', () => {
    let module: TestingModule

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [LocalePrefixAppModule],
      }).compile()
    })

    afterAll(async () => {
      await module.close()
    })

    it('accepts a real cuid2 in the primary path', async () => {
      const response = await module.http.get(`/${VALID_CUID2}/settings`).send()
      response.assertOk()
      await response.assertJsonPath('tenantId', VALID_CUID2)
    })

    it('accepts a real cuid2 under the locale variant', async () => {
      const response = await module.http.get(`/sw/${VALID_CUID2}/settings`).send()
      response.assertOk()
      await response.assertJsonPath('tenantId', VALID_CUID2)
    })

    it('rejects strings with non-alphanumeric chars (hyphens fail the regex)', async () => {
      const response = await module.http.get('/not-a-cuid/settings').send()
      response.assertBadRequest()
    })

    it('GOTCHA — accepts a locale prefix as tenantId, because z.cuid2() regex is too loose', async () => {
      // `'sw'` passes z.cuid2()'s `/^[0-9a-z]+$/`, so the validator green-lights
      // it and the controller renders. Documents Zod's surprising-but-correct
      // behaviour for the registered schema; the fix lives in user code (use
      // a stricter shape) — see the strict-schema describe block below.
      const response = await module.http.get('/sw/settings').send()
      response.assertOk()
      await response.assertJsonPath('tenantId', 'sw')
    })

    it('route registration attaches the validator middleware', () => {
      const registry = module.container.resolve<RouteRegistry>(ROUTER_TOKENS.RouteRegistry)
      const named = registry.named()
      expect(named.find(r => r.name === 'settings.profile')).toBeDefined()

      const honoApp = module.container.resolve<HonoApp>(ROUTER_TOKENS.HonoApp)
      const settingsHandlers = honoApp.routes.filter(
        r => r.method === 'GET' && r.path === '/:tenantId/settings',
      )
      // Two entries: validator middleware (anonymous) + actual handler.
      // The validator IS present at registration; the bug was upstream of
      // here (stale meta.config.params when the controller had been
      // registered before in a previous Application instance).
      expect(settingsHandlers).toHaveLength(2)
      expect(settingsHandlers[1].handler.name).toBe('http:LocalePrefixSettingsController.profile')
    })
  })

  describe('with a strict cuid2 regex — rejects locale prefixes', () => {
    let module: TestingModule

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [LocalePrefixStrictAppModule],
      }).compile()
    })

    afterAll(async () => {
      await module.close()
    })

    it('still accepts a real cuid2', async () => {
      const response = await module.http.get(`/${VALID_CUID2}/settings`).send()
      response.assertOk()
      await response.assertJsonPath('tenantId', VALID_CUID2)
    })

    it('still accepts a real cuid2 under the locale variant', async () => {
      const response = await module.http.get(`/sw/${VALID_CUID2}/settings`).send()
      response.assertOk()
      await response.assertJsonPath('tenantId', VALID_CUID2)
    })

    it('rejects a locale prefix masquerading as tenantId', async () => {
      // The exact failure mode the consumer hit: `/sw/settings` matches the
      // primary `/:tenantId/settings` (locale variant needs 3 segments),
      // captures `tenantId='sw'`. With a strict regex, validation rejects.
      // Before the prototype-mutation fix, this test would fail with 200
      // because the strict schema was being silently overwritten by the
      // stale `z.cuid2()` schema cached from the previous describe block.
      const response = await module.http.get('/sw/settings').send()
      response.assertBadRequest()
      await response.assertJsonPathExists('metadata.issues')
    })

    it('rejects any non-cuid2 string', async () => {
      const response = await module.http.get('/not-a-cuid/settings').send()
      response.assertBadRequest()
    })
  })

  describe('Zod 4.3.6 cuid2 behaviour', () => {
    it('accepts ANY non-empty lowercase-alphanumeric string', async () => {
      const { z } = await import('../../src/i18n/validation')
      const cuid2 = z.cuid2()

      expect((await cuid2.safeParseAsync('sw')).success).toBe(true)
      expect((await cuid2.safeParseAsync('a')).success).toBe(true)
      expect((await cuid2.safeParseAsync('0')).success).toBe(true)
      expect((await cuid2.safeParseAsync(VALID_CUID2)).success).toBe(true)

      expect((await cuid2.safeParseAsync('not-a-cuid')).success).toBe(false)
      expect((await cuid2.safeParseAsync('UPPERCASE')).success).toBe(false)
      expect((await cuid2.safeParseAsync('')).success).toBe(false)
    })

    it('a strict shape regex enforces real cuid2 length', async () => {
      const { z } = await import('../../src/i18n/validation')
      const strict = z.string().regex(/^[a-z][0-9a-z]{23,31}$/)

      expect((await strict.safeParseAsync('sw')).success).toBe(false)
      expect((await strict.safeParseAsync(VALID_CUID2)).success).toBe(true)
    })
  })
})
