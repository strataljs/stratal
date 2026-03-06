import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { PostFactory } from '../factories/post.factory'
import { TestAppModule } from '../fixtures/app.module'
import { RbacSeeder } from '../seeders/rbac.seeder'
import { ADMIN_USER_ID, REGULAR_USER_ID, UserSeeder } from '../seeders/user.seeder'

describe('Cross-Module Integration', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile()

    await module.truncateDb()
  })

  afterEach(async () => {
    await module.truncateDb()
  })

  afterAll(async () => {
    await module.close()
  })

  describe('Full User Flow', () => {
    it('create user → assign role → authenticated request to guarded route → verify DB', async () => {
      // 1. Seed users and roles
      await module.seed(new UserSeeder())
      await module.seed(new RbacSeeder())

      // 2. Authenticated request to protected route
      const response = await module.http
        .get('/api/test/users')
        .actingAs({ id: ADMIN_USER_ID })
        .send()

      response.assertOk()

      // 3. Verify the response contains the seeded users
      const body = await response.json<{ id: string; email: string }[]>()
      expect(body.length).toBeGreaterThanOrEqual(3)

      // 4. Verify DB state
      await module.assertDatabaseHas('user', { email: 'admin@test.com' })
      await module.assertDatabaseHas('user', { email: 'user@test.com' })
    })
  })

  describe('Post Creation Flow', () => {
    it('auth + guard + DB insert + correct authorId', async () => {
      await module.seed(new UserSeeder())
      await module.seed(new RbacSeeder())

      // Create post as authenticated user
      const createResponse = await module.http
        .post('/api/test/posts')
        .actingAs({ id: REGULAR_USER_ID })
        .withBody({ title: 'Integration Test Post', content: 'Full flow test' })
        .send()

      createResponse.assertCreated()
      await createResponse.assertJsonPath('authorId', REGULAR_USER_ID)
      await createResponse.assertJsonPath('title', 'Integration Test Post')

      // Verify in DB
      const postData = await createResponse.json<{ id: string }>()
      await module.assertDatabaseHas('post', {
        id: postData.id,
        authorId: REGULAR_USER_ID,
        title: 'Integration Test Post',
      })
    })
  })

  describe('Concurrent Requests', () => {
    it('5 parallel POST requests all succeed', async () => {
      await module.seed(new UserSeeder())
      await module.seed(new RbacSeeder())

      const requests = Array.from({ length: 5 }, (_, i) =>
        module.http
          .post('/api/test/posts')
          .actingAs({ id: REGULAR_USER_ID })
          .withBody({ title: `Concurrent Post ${i}`, content: `Content ${i}` })
          .send()
      )

      const responses = await Promise.all(requests)

      for (const response of responses) {
        response.assertCreated()
      }

      await module.assertDatabaseCount('post', 5)
    })
  })

  describe('Unauthenticated to Authenticated Upgrade', () => {
    it('public route accessible, then authenticated route succeeds', async () => {
      await module.seed(new UserSeeder())
      await module.seed(new RbacSeeder())

      // 1. Access public route without auth
      const publicResponse = await module.http
        .get('/api/test/public')
        .send()

      publicResponse.assertOk()
      await publicResponse.assertJsonPath('message', 'public')

      // 2. Access protected route without auth → 401
      const unauthResponse = await module.http
        .get('/api/test/users')
        .send()

      unauthResponse.assertUnauthorized()

      // 3. Access protected route with auth → 200
      const authResponse = await module.http
        .get('/api/test/users')
        .actingAs({ id: REGULAR_USER_ID })
        .send()

      authResponse.assertOk()
    })
  })

  describe('Role-Based Access Differentiation', () => {
    it('admin and regular user get different outcomes on admin route', async () => {
      await module.seed(new UserSeeder())
      await module.seed(new RbacSeeder())

      // Admin can access
      const adminResponse = await module.http
        .get('/api/test/admin')
        .actingAs({ id: ADMIN_USER_ID })
        .send()

      adminResponse.assertOk()
      await adminResponse.assertJsonPath('access', 'admin')

      // Regular user gets 403
      const userResponse = await module.http
        .get('/api/test/admin')
        .actingAs({ id: REGULAR_USER_ID })
        .send()

      userResponse.assertForbidden()
    })

    it('admin can update and delete posts, regular user cannot', async () => {
      await module.seed(new UserSeeder())
      await module.seed(new RbacSeeder())

      const db = await module.getDb()
      const post = await new PostFactory().forAuthor(ADMIN_USER_ID).published().create(db)

      // Admin can update
      const updateResponse = await module.http
        .put(`/api/test/posts/${post.id}`)
        .actingAs({ id: ADMIN_USER_ID })
        .withBody({ title: 'Admin Updated' })
        .send()

      updateResponse.assertOk()

      // Regular user cannot update
      const userUpdateResponse = await module.http
        .put(`/api/test/posts/${post.id}`)
        .actingAs({ id: REGULAR_USER_ID })
        .withBody({ title: 'User Tried' })
        .send()

      userUpdateResponse.assertForbidden()

      // Admin can delete
      const deleteResponse = await module.http
        .delete(`/api/test/posts/${post.id}`)
        .actingAs({ id: ADMIN_USER_ID })
        .send()

      deleteResponse.assertOk()
      await module.assertDatabaseMissing('post', { id: post.id })
    })
  })
})
