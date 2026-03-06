import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { TestAppModule } from '../fixtures/app.module'
import { REGULAR_USER_ID, UserSeeder } from '../seeders/user.seeder'

describe('AuthContext', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile()

    await module.truncateDb()
    await module.seed(new UserSeeder())
  })

  afterAll(async () => {
    await module.close()
  })

  describe('Authenticated User', () => {
    it('returns user data when authenticated (isAuthenticated = true)', async () => {
      const response = await module.http
        .get('/api/test/users')
        .actingAs({ id: REGULAR_USER_ID })
        .send()

      response.assertOk()
    })

    it('sets authorId from AuthContext when creating a post', async () => {
      const response = await module.http
        .post('/api/test/posts')
        .actingAs({ id: REGULAR_USER_ID })
        .withBody({ title: 'Context Test Post', content: 'Content' })
        .send()

      response.assertCreated()
      await response.assertJsonPath('authorId', REGULAR_USER_ID)
    })
  })

  describe('Unauthenticated User', () => {
    it('returns 401 when requireUserId is called without authentication', async () => {
      const response = await module.http
        .post('/api/test/posts')
        .withBody({ title: 'Should Fail', content: 'Content' })
        .send()

      response.assertUnauthorized()
    })
  })

  describe('Public Routes Without AuthContext', () => {
    it('public routes work without AuthContext being set', async () => {
      const response = await module.http
        .get('/api/test/public')
        .send()

      response.assertOk()
      await response.assertJsonPath('message', 'public')
    })

    it('public route with params works without authentication', async () => {
      const response = await module.http
        .get('/api/test/public/test-id-123')
        .send()

      response.assertOk()
      await response.assertJsonPath('id', 'test-id-123')
    })
  })
})
