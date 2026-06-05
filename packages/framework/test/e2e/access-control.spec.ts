import { Test, type TestingModule } from '@stratal/testing'
import { DI_TOKENS } from 'stratal/di'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type AccessService } from '../../src/access-control/services/access.service'
import { AC_TOKENS } from '../../src/access-control/tokens'
import { type AuthUser, AuthContext } from '../../src/context/auth-context'
import { TestAppModule } from '../fixtures/app.module'
import { ADMIN_USER_ID, REGULAR_USER_ID, UNVERIFIED_USER_ID, UserSeeder } from '../seeders/user.seeder'

describe('AccessControl Module', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile()
  })

  beforeEach(async () => {
    await module.truncateDb()
    await module.seed(UserSeeder)
  })

  afterAll(async () => {
    await module.close()
  })

  function getService(userId?: string, role?: string): AccessService {
    const authContext = new AuthContext()
    if (userId) {
      const now = new Date()
      authContext.setAuthContext({
        user: {
          id: userId,
          email: `${userId}@test.com`,
          emailVerified: userId !== UNVERIFIED_USER_ID,
          ...(role ? { role } : {}),
          createdAt: now,
          updatedAt: now,
        } as AuthUser,
      })
    }
    module.container.registerValue(DI_TOKENS.AuthContext, authContext)
    return module.get<AccessService>(AC_TOKENS.AccessService)
  }

  describe('Role Management', () => {
    it('getUserRoles returns role from user.role column', async () => {
      const service = getService()
      const adminRoles = await service.getUserRoles(ADMIN_USER_ID)
      const userRoles = await service.getUserRoles(REGULAR_USER_ID)

      expect(adminRoles).toEqual(['admin'])
      expect(userRoles).toEqual(['user'])
    })

    it('getUserRoles returns multiple roles when comma-separated', async () => {
      const service = getService()
      await service.setUserRole(REGULAR_USER_ID, ['user', 'editor'])

      const roles = await service.getUserRoles(REGULAR_USER_ID)
      expect(roles).toContain('user')
      expect(roles).toContain('editor')
      expect(roles).toHaveLength(2)
    })

    it('setUserRole persists single role', async () => {
      const service = getService()
      await service.setUserRole(REGULAR_USER_ID, 'moderator')

      const roles = await service.getUserRoles(REGULAR_USER_ID)
      expect(roles).toEqual(['moderator'])
    })

    it('setUserRole with array joins to comma-separated in DB', async () => {
      const service = getService()
      await service.setUserRole(ADMIN_USER_ID, ['admin', 'super_admin'])

      const roles = await service.getUserRoles(ADMIN_USER_ID)
      expect(roles).toContain('admin')
      expect(roles).toContain('super_admin')
      expect(roles).toHaveLength(2)
    })

    it('getCurrentUserRoles returns roles from AuthContext (no DB hit)', () => {
      const service = getService(ADMIN_USER_ID, 'admin')
      const roles = service.getCurrentUserRoles()

      expect(roles).toEqual(['admin'])
    })

    it('getCurrentUserRoles returns empty array when unauthenticated', () => {
      const service = getService()
      const roles = service.getCurrentUserRoles()

      expect(roles).toEqual([])
    })
  })

  describe('Permission Checking', () => {
    it('hasPermission returns true for an action the role allows', async () => {
      const service = getService()

      expect(await service.hasPermission(ADMIN_USER_ID, { posts: ['update'] })).toBe(true)
      expect(await service.hasPermission(ADMIN_USER_ID, { admin: ['access'] })).toBe(true)
      expect(await service.hasPermission(REGULAR_USER_ID, { posts: ['create'] })).toBe(true)
      expect(await service.hasPermission(REGULAR_USER_ID, { posts: ['read'] })).toBe(true)
    })

    it('hasPermission returns false for an action the role does not allow', async () => {
      const service = getService()

      expect(await service.hasPermission(REGULAR_USER_ID, { posts: ['update'] })).toBe(false)
      expect(await service.hasPermission(REGULAR_USER_ID, { posts: ['delete'] })).toBe(false)
      expect(await service.hasPermission(REGULAR_USER_ID, { admin: ['access'] })).toBe(false)
    })

    it('hasPermission returns true if any role allows (OR logic)', async () => {
      const service = getService()
      // Give the user a second role that allows the action
      await service.setUserRole(REGULAR_USER_ID, ['user', 'admin'])

      expect(await service.hasPermission(REGULAR_USER_ID, { admin: ['access'] })).toBe(true)
    })

    it('hasPermission returns false for an unknown role name', async () => {
      const service = getService()
      await service.setUserRole(REGULAR_USER_ID, 'unknown-role')

      expect(await service.hasPermission(REGULAR_USER_ID, { posts: ['read'] })).toBe(false)
    })

    it('currentUserHasPermission reads from AuthContext (no DB hit)', () => {
      const service = getService(ADMIN_USER_ID, 'admin')

      expect(service.currentUserHasPermission({ posts: ['update'] })).toBe(true)
      expect(service.currentUserHasPermission({ admin: ['access'] })).toBe(true)
    })

    it('currentUserHasPermission returns false when unauthenticated', () => {
      const service = getService()

      expect(service.currentUserHasPermission({ posts: ['read'] })).toBe(false)
    })
  })

  describe('Frontend Permissions', () => {
    it('getPermissionsForUser returns merged statements for all roles', async () => {
      const service = getService()

      const adminPerms = await service.getPermissionsForUser(ADMIN_USER_ID)
      expect(adminPerms.posts).toEqual(expect.arrayContaining(['create', 'read', 'update', 'delete']))
      expect(adminPerms.admin).toEqual(expect.arrayContaining(['access']))

      const userPerms = await service.getPermissionsForUser(REGULAR_USER_ID)
      expect(userPerms.posts).toEqual(expect.arrayContaining(['create', 'read']))
      expect(userPerms.admin).toBeUndefined()
    })

    it('getPermissionsForUser merges permissions across multiple roles', async () => {
      const service = getService()
      await service.setUserRole(REGULAR_USER_ID, ['user', 'admin'])

      const perms = await service.getPermissionsForUser(REGULAR_USER_ID)
      expect(perms.posts).toEqual(expect.arrayContaining(['create', 'read', 'update', 'delete']))
      expect(perms.admin).toEqual(expect.arrayContaining(['access']))
    })

    it('getCurrentUserPermissions returns empty object when unauthenticated', () => {
      const service = getService()
      const perms = service.getCurrentUserPermissions()

      expect(perms).toEqual({})
    })

    it('getCurrentUserPermissions returns permissions from AuthContext (no DB hit)', () => {
      const service = getService(REGULAR_USER_ID, 'user')
      const perms = service.getCurrentUserPermissions()

      expect(perms.posts).toEqual(expect.arrayContaining(['create', 'read']))
    })
  })
})
