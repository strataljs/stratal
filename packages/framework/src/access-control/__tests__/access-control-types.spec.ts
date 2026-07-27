import { describe, expectTypeOf, it } from 'vitest'
import { createAccessControl } from '../create-access-control'

/**
 * The Inertia type generator resolves the app's `accessControl:` option through
 * the TypeScript checker to emit `AccessControlRegistry`. That only works while
 * `AccessControlOptions` keeps its statements generic (so resource names and
 * action literals survive) and `createAccessControl` uses `const` type params
 * (so callers don't have to remember `as const`).
 *
 * These are compile-time guards. If they regress, the generator silently emits
 * a `string`-shaped union that type-checks everything.
 *
 * Note: this project does not enable vitest's typecheck mode, so under
 * `vitest run` the `expectTypeOf` assertions below are runtime no-ops — this
 * file passes green even when the types it guards are broken. Only
 * `yarn workspace @stratal/framework typecheck` (`tsc --noEmit`) actually
 * enforces them; that's the command CI relies on to catch a regression here.
 */
describe('access-control type inference', () => {
  it('preserves resource and action literals without `as const`', () => {
    const permissions = createAccessControl({
      resources: { posts: ['create', 'read'], admin: ['access'] },
      roles: {
        admin: { posts: ['create', 'read'], admin: ['access'] },
        user: { posts: ['read'] },
      },
    })

    expectTypeOf(permissions.ac.statements.posts).toEqualTypeOf<readonly ['create', 'read']>()
    expectTypeOf(permissions.ac.statements.admin).toEqualTypeOf<readonly ['access']>()
  })

  it('preserves role names', () => {
    const permissions = createAccessControl({
      resources: { posts: ['read'] },
      roles: { admin: { posts: ['read'] }, user: { posts: ['read'] } },
    })

    expectTypeOf<keyof typeof permissions.roles>().toEqualTypeOf<'admin' | 'user'>()
  })
})
