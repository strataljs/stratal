import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { TestAppModule } from '../fixtures/app.module'
import { ADMIN_USER_ID, REGULAR_USER_ID, UserSeeder } from '../seeders/user.seeder'

describe('Auth Module', () => {
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

  describe('Session Verification', () => {
    it('allows access to protected route with valid session via actingAs', async () => {
      const response = await module.http
        .get('/api/test/users')
        .actingAs({ id: REGULAR_USER_ID })
        .send()

      response.assertOk()
    })

    it('returns 401 on protected route without session', async () => {
      const response = await module.http
        .get('/api/test/users')
        .send()

      response.assertUnauthorized()
    })

    it('returns 401 with invalid cookie', async () => {
      const response = await module.http
        .withHeaders({ cookie: 'better-auth.session_token=invalid-token-value' })
        .get('/api/test/users')
        .send()

      response.assertUnauthorized()
    })

    it('returns 401 with malformed cookie', async () => {
      const response = await module.http
        .withHeaders({ cookie: 'malformed=;;;invalid' })
        .get('/api/test/users')
        .send()

      response.assertUnauthorized()
    })
  })

  describe('Multiple Users', () => {
    it('supports multiple users with separate sessions in the same test', async () => {
      const adminResponse = await module.http
        .get('/api/test/users')
        .actingAs({ id: ADMIN_USER_ID })
        .send()

      adminResponse.assertOk()

      const userResponse = await module.http
        .get('/api/test/users')
        .actingAs({ id: REGULAR_USER_ID })
        .send()

      userResponse.assertOk()
    })
  })

  describe('Public Routes', () => {
    it('allows access to public routes without authentication', async () => {
      const response = await module.http
        .get('/api/test/public')
        .send()

      response.assertOk()
      await response.assertJsonPath('message', 'public')
    })

    it('allows access to public routes with authentication', async () => {
      const response = await module.http
        .get('/api/test/public')
        .actingAs({ id: REGULAR_USER_ID })
        .send()

      response.assertOk()
      await response.assertJsonPath('message', 'public')
    })
  })
})
