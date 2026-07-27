import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../context/auth-context'
import { AccessService } from '../services/access.service'
import type { AccessControlOptions } from '../types'

/**
 * Unit regression guard for the model-agnostic role read/write path.
 *
 * `AccessService` must resolve the user model through Better Auth's
 * `internalAdapter` (which maps the logical `"user"` model to the configured
 * table regardless of ORM naming), NOT through a hardcoded ORM accessor such
 * as `db.user`. Apps whose ZenStack/Prisma user model is pluralized (`Users`
 * → `db.users`) previously broke on `setUserRole` / `getUserRoles(other)`.
 *
 * These tests assert the delegation to `internalAdapter` and — structurally —
 * that `AccessService` no longer depends on the raw `Database` service (its
 * constructor takes only AuthContext, AuthService, and the AC options).
 */
describe('AccessService — model-agnostic role persistence', () => {
  function makeService(currentUser?: { id: string; role?: string }) {
    const findUserById = vi.fn((id: string) => Promise.resolve({ id, role: 'admin' }))
    const updateUser = vi.fn((id: string, data: { role?: string }) => Promise.resolve({ id, ...data }))

    const authService = {
      auth: {
        $context: Promise.resolve({ internalAdapter: { findUserById, updateUser } }),
      },
    } as unknown as ConstructorParameters<typeof AccessService>[1]

    const authContext = new AuthContext()
    if (currentUser) {
      const now = new Date()
      authContext.setAuthContext({
        user: {
          id: currentUser.id,
          name: `User ${currentUser.id}`,
          email: `${currentUser.id}@test.com`,
          emailVerified: true,
          ...(currentUser.role ? { role: currentUser.role } : {}),
          createdAt: now,
          updatedAt: now,
        },
      })
    }

    // Minimal options — these tests exercise persistence delegation, not
    // permission evaluation, so no roles are needed.
    const options = { ac: {}, roles: {} } as unknown as AccessControlOptions

    return { service: new AccessService(authContext, authService, options), findUserById, updateUser }
  }

  it('getUserRoles reads a non-current user via internalAdapter.findUserById (no raw ORM)', async () => {
    const { service, findUserById } = makeService()

    const roles = await service.getUserRoles('other-user')

    expect(findUserById).toHaveBeenCalledWith('other-user')
    expect(roles).toEqual(['admin'])
  })

  it('getUserRoles short-circuits to the session for the current user (no DB hit)', async () => {
    const { service, findUserById } = makeService({ id: 'me', role: 'super_admin' })

    const roles = await service.getUserRoles('me')

    expect(roles).toEqual(['super_admin'])
    expect(findUserById).not.toHaveBeenCalled()
  })

  it('setUserRole writes via internalAdapter.updateUser with the comma-joined role string', async () => {
    const { service, updateUser } = makeService()

    await service.setUserRole('target', ['admin', 'super_admin'])

    expect(updateUser).toHaveBeenCalledWith('target', { role: 'admin,super_admin' })
  })

  it('setUserRole accepts a single role', async () => {
    const { service, updateUser } = makeService()

    await service.setUserRole('target', 'moderator')

    expect(updateUser).toHaveBeenCalledWith('target', { role: 'moderator' })
  })
})
