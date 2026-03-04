import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { CasbinService } from '../../src/rbac/services/casbin.service'
import { RBAC_TOKENS } from '../../src/rbac/tokens'
import { TestAppModule } from '../fixtures/app.module'
import { RbacSeeder } from '../seeders/rbac.seeder'
import { ADMIN_USER_ID, REGULAR_USER_ID, UserSeeder } from '../seeders/user.seeder'

describe('RBAC Module', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile()
  })

  beforeEach(async () => {
    await module.truncateDb()
    await module.seed(new UserSeeder())
    await module.seed(new RbacSeeder())
  })

  afterAll(async () => {
    await module.close()
  })

  async function getCasbinService(): Promise<CasbinService> {
    return module.runInRequestScope(() => {
      return module.get<CasbinService>(RBAC_TOKENS.CasbinService)
    })
  }

  describe('Role Management', () => {
    it('getRolesForUser returns seeded roles', async () => {
      const casbin = await getCasbinService()
      const adminRoles = await casbin.getRolesForUser(ADMIN_USER_ID)
      const userRoles = await casbin.getRolesForUser(REGULAR_USER_ID)

      expect(adminRoles.includes('admin')).toBe(true)
      expect(userRoles.includes('user')).toBe(true)
    })

    it('hasRoleForUser returns true for assigned role', async () => {
      const casbin = await getCasbinService()

      expect(await casbin.hasRoleForUser(ADMIN_USER_ID, 'admin')).toBe(true)
      expect(await casbin.hasRoleForUser(REGULAR_USER_ID, 'user')).toBe(true)
    })

    it('hasRoleForUser returns false for unassigned role', async () => {
      const casbin = await getCasbinService()

      expect(await casbin.hasRoleForUser(REGULAR_USER_ID, 'admin')).toBe(false)
    })

    it('addRoleForUser assigns a new role', async () => {
      const casbin = await getCasbinService()

      await casbin.addRoleForUser(REGULAR_USER_ID, 'moderator')

      const roles = await casbin.getRolesForUser(REGULAR_USER_ID)
      expect(roles.includes('moderator')).toBe(true)
    })

    it('deleteRoleForUser removes a role', async () => {
      const casbin = await getCasbinService()

      await casbin.deleteRoleForUser(ADMIN_USER_ID, 'admin')

      expect(await casbin.hasRoleForUser(ADMIN_USER_ID, 'admin')).toBe(false)
    })

    it('setRolesForUser replaces all roles', async () => {
      const casbin = await getCasbinService()

      await casbin.setRolesForUser(REGULAR_USER_ID, ['editor', 'reviewer'])

      const roles = await casbin.getRolesForUser(REGULAR_USER_ID)
      expect(roles.includes('editor')).toBe(true)
      expect(roles.includes('reviewer')).toBe(true)
      expect(roles.includes('user')).toBe(false)
    })
  })

  describe('Permission Checking', () => {
    it('hasPermission checks against Casbin policies', async () => {
      const casbin = await getCasbinService()

      // Admin has 'posts:*' with '.*' action
      expect(await casbin.hasPermission(ADMIN_USER_ID, 'posts:*', 'get')).toBe(true)
      expect(await casbin.hasPermission(ADMIN_USER_ID, 'posts:*', 'post')).toBe(true)

      // Regular user has 'posts:read' with 'get' action
      expect(await casbin.hasPermission(REGULAR_USER_ID, 'posts:read', 'get')).toBe(true)
      expect(await casbin.hasPermission(REGULAR_USER_ID, 'posts:delete', 'delete')).toBe(false)
    })

    it('hasAnyPermission checks multiple scopes', async () => {
      const casbin = await getCasbinService()

      // Regular user has posts:read and posts:create
      expect(
        await casbin.hasAnyPermission(REGULAR_USER_ID, ['posts:read', 'posts:create'], 'get')
      ).toBe(true)

      // Regular user does NOT have admin scopes
      expect(
        await casbin.hasAnyPermission(REGULAR_USER_ID, ['admin:dashboard'], 'get')
      ).toBe(false)
    })
  })

  describe('Role Hierarchy', () => {
    it('super_admin inherits admin permissions via hierarchy', async () => {
      const casbin = await getCasbinService()

      // Add super_admin role to a user
      await casbin.addRoleForUser(REGULAR_USER_ID, 'super_admin')

      // super_admin inherits from admin (per RbacModule config)
      const roles = await casbin.getImplicitRolesForUser(REGULAR_USER_ID)
      expect(roles.includes('super_admin')).toBe(true)
      expect(roles.includes('admin')).toBe(true)

      // Should have admin permissions through hierarchy
      expect(await casbin.hasPermission(REGULAR_USER_ID, 'admin:*', 'get')).toBe(true)
    })
  })

  describe('Frontend Permission Format', () => {
    it('getPermissionsForUserAsCasbinJs returns formatted permissions', async () => {
      const casbin = await getCasbinService()

      const permissions = await casbin.getPermissionsForUserAsCasbinJs(ADMIN_USER_ID)

      expect(permissions).toBeDefined()
      expect(typeof permissions).toBe('object')
      // Admin has '.*' actions so the key should exist
      expect(Object.keys(permissions).length).toBeGreaterThan(0)
    })
  })

  describe('Policy Persistence', () => {
    it('policies persist in casbinRule database table', async () => {
      await module.assertDatabaseHas('casbinRule', { ptype: 'g', v0: ADMIN_USER_ID, v1: 'admin' })
      await module.assertDatabaseHas('casbinRule', { ptype: 'p', v0: 'admin', v1: 'users:*', v2: '.*' })
    })

    it('dynamically added roles persist', async () => {
      const casbin = await getCasbinService()

      await casbin.addRoleForUser(REGULAR_USER_ID, 'tester')

      await module.assertDatabaseHas('casbinRule', { ptype: 'g', v0: REGULAR_USER_ID, v1: 'tester' })
    })
  })
})
