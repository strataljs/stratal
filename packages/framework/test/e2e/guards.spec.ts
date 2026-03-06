import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { TestAppModule } from '../fixtures/app.module'
import { UserSeeder, ADMIN_USER_ID, REGULAR_USER_ID } from '../seeders/user.seeder'
import { RbacSeeder } from '../seeders/rbac.seeder'
import { PostFactory } from '../factories/post.factory'

describe('Guards', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile()

    await module.truncateDb()
    await module.seed(new UserSeeder())
    await module.seed(new RbacSeeder())
  })

  afterAll(async () => {
    await module.close()
  })

  describe('AuthGuard() - no scopes', () => {
    it('allows authenticated user', async () => {
      const response = await module.http
        .get('/api/test/users')
        .actingAs({ id: REGULAR_USER_ID })
        .send()

      response.assertOk()
    })

    it('rejects unauthenticated user with 401', async () => {
      const response = await module.http
        .get('/api/test/users')
        .send()

      response.assertUnauthorized()
    })
  })

  describe('AuthGuard({ scopes }) - with scopes', () => {
    it('allows admin user to update a post (admin has posts:* with .*)', async () => {
      const db = await module.getDb()
      const post = await new PostFactory().forAuthor(ADMIN_USER_ID).create(db)

      const response = await module.http
        .put(`/api/test/posts/${post.id}`)
        .actingAs({ id: ADMIN_USER_ID })
        .withBody({ title: 'Updated by Admin' })
        .send()

      response.assertOk()
      await response.assertJsonPath('title', 'Updated by Admin')
    })

    it('rejects regular user from updating a post (no posts:update scope)', async () => {
      const db = await module.getDb()
      const post = await new PostFactory().forAuthor(REGULAR_USER_ID).create(db)

      const response = await module.http
        .put(`/api/test/posts/${post.id}`)
        .actingAs({ id: REGULAR_USER_ID })
        .withBody({ title: 'Should Fail' })
        .send()

      response.assertForbidden()
    })

    it('rejects unauthenticated user from scoped routes with 401', async () => {
      const response = await module.http
        .put('/api/test/posts/some-id')
        .withBody({ title: 'No Auth' })
        .send()

      response.assertUnauthorized()
    })
  })

  describe('Admin Routes', () => {
    it('allows admin to access admin dashboard', async () => {
      const response = await module.http
        .get('/api/test/admin')
        .actingAs({ id: ADMIN_USER_ID })
        .send()

      response.assertOk()
      await response.assertJsonPath('access', 'admin')
    })

    it('rejects regular user from admin dashboard with 403', async () => {
      const response = await module.http
        .get('/api/test/admin')
        .actingAs({ id: REGULAR_USER_ID })
        .send()

      response.assertForbidden()
    })
  })

  describe('Method-level vs Controller-level Guards', () => {
    it('posts index has no guard - accessible without auth', async () => {
      const response = await module.http
        .get('/api/test/posts')
        .send()

      response.assertOk()
    })

    it('posts create has method-level AuthGuard - requires auth', async () => {
      const response = await module.http
        .post('/api/test/posts')
        .withBody({ title: 'Test Post' })
        .send()

      response.assertUnauthorized()
    })

    it('posts delete has scoped method-level guard', async () => {
      const db = await module.getDb()
      const post = await new PostFactory().forAuthor(REGULAR_USER_ID).create(db)

      // Regular user can't delete (no posts:delete scope)
      const response = await module.http
        .delete(`/api/test/posts/${post.id}`)
        .actingAs({ id: REGULAR_USER_ID })
        .send()

      response.assertForbidden()
    })

    it('admin can delete posts (admin has posts:* with .*)', async () => {
      const db = await module.getDb()
      const post = await new PostFactory().forAuthor(ADMIN_USER_ID).create(db)

      const response = await module.http
        .delete(`/api/test/posts/${post.id}`)
        .actingAs({ id: ADMIN_USER_ID })
        .send()

      response.assertOk()
      await response.assertJsonPath('deleted', true)
    })
  })

  describe('HTTP Method as Casbin Action', () => {
    it('uses GET as action for read operations', async () => {
      const response = await module.http
        .get('/api/test/users')
        .actingAs({ id: REGULAR_USER_ID })
        .send()

      // Users controller has AuthGuard() without scopes, so just auth check
      response.assertOk()
    })

    it('uses POST as action for create operations', async () => {
      // Regular user has 'posts:create' scope with 'post' action
      const response = await module.http
        .post('/api/test/posts')
        .actingAs({ id: REGULAR_USER_ID })
        .withBody({ title: 'User Post' })
        .send()

      response.assertCreated()
    })
  })
})
