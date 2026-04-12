import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { ScopedMiddlewareAppModule } from '../fixtures/scoped-middleware.controller'

/**
 * Regression tests for scoped middleware registered via
 * `Router.group(...).middleware(...)`.
 *
 * Previously the registration used `app.use(${primaryRoute.path}/*, ...)`,
 * where `${primaryRoute.path}/*` only matched paths *under* the controller's
 * primary route — never the route itself, and not sibling routes when the
 * primary route was an index. As a result, scoped middleware silently
 * skipped non-index siblings inside the same group, e.g. a request to
 * `/admin/abc/ui` wouldn't run the group middleware even though the UI
 * controller was a member of the group.
 *
 * The fix attaches scoped middleware directly to each route's middleware
 * chain. These tests pin that behaviour: every route in a group must run
 * its scoped middleware exactly once, regardless of whether the route is
 * the group's index or a sibling.
 */
describe('Scoped middleware on group routes', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ScopedMiddlewareAppModule],
    }).compile()
  })

  afterAll(async () => {
    await module.close()
  })

  it('runs scoped middleware on the group index route', async () => {
    const response = await module.http.get('/admin/abc').send()
    response.assertOk()
    await response.assertJsonPath('scopedTag', 'group-mw-ran')
  })

  it('runs scoped middleware on a sibling route under the group prefix', async () => {
    const response = await module.http.get('/admin/abc/ui').send()
    response.assertOk()
    await response.assertJsonPath('scopedTag', 'group-mw-ran')
  })

  it('exposes validated path params to scoped middleware via ctx.param()', async () => {
    // Pins the bug fix that runs scoped middleware AFTER request
    // validators in the openapi route handler chain — so `ctx.param()`
    // can read `c.req.valid('param')` from inside the middleware.
    const response = await module.http.get('/admin/abc/ui').send()
    response.assertOk()
    await response.assertJsonPath('scopedOrganizationId', 'abc')
  })
})
