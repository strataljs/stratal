import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { PostFactory } from '../factories/post.factory'
import { UserFactory } from '../factories/user.factory'
import { TestAppModule } from '../fixtures/app.module'
import { UserSeeder } from '../seeders/user.seeder'

describe('Database Module', () => {
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

  describe('CRUD Operations', () => {
    it('creates a user via factory', async () => {
      const db = await module.getDb()
      const user = await new UserFactory().create(db)

      expect(user).toBeDefined()
      expect(user.id).toBeDefined()
      expect(user.email).toBeDefined()
      expect(user.emailVerified).toBe(true)
      expect(user.role).toBe('user')

      await module.assertDatabaseHas('user', { id: user.id })
    })

    it('reads a user by ID', async () => {
      const db = await module.getDb()
      const created = await new UserFactory().withEmail('read@test.com').create(db)

      const found = await db.user.findUnique({ where: { id: created.id } })

      expect(found).not.toBeNull()
      expect(found?.email).toBe('read@test.com')
    })

    it('updates a user', async () => {
      const db = await module.getDb()
      const user = await new UserFactory().create(db)

      await db.user.update({
        where: { id: user.id },
        data: { name: 'Updated Name' },
      })

      await module.assertDatabaseHas('user', { id: user.id, name: 'Updated Name' })
    })

    it('deletes a user', async () => {
      const db = await module.getDb()
      const user = await new UserFactory().create(db)

      await db.user.delete({ where: { id: user.id } })

      await module.assertDatabaseMissing('user', { id: user.id })
    })

    it('creates multiple users via factory', async () => {
      const db = await module.getDb()
      const users = await new UserFactory().count(3).createManyAndReturn(db)

      expect(users).toHaveLength(3)
      await module.assertDatabaseCount('user', 3)
    })

    it('creates a post with author relationship', async () => {
      const db = await module.getDb()
      const user = await new UserFactory().create(db)
      const post = await new PostFactory().forAuthor(user.id).create(db)

      expect(post.authorId).toBe(user.id)
      await module.assertDatabaseHas('post', { id: post.id, authorId: user.id })
    })
  })

  describe('Transactions', () => {
    it('commits a successful transaction', async () => {
      const db = await module.getDb()

      await db.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            id: 'tx-user-1',
            email: 'tx@test.com',
            name: 'TX User',
            emailVerified: true,
            role: 'user',
          },
        })
      })

      await module.assertDatabaseHas('user', { id: 'tx-user-1' })
    })

    it('rolls back a failed transaction', async () => {
      const db = await module.getDb()

      try {
        await db.$transaction(async (tx) => {
          await tx.user.create({
            data: {
              id: 'tx-rollback-user',
              email: 'rollback@test.com',
              name: 'Rollback User',
              emailVerified: true,
              role: 'user',
            },
          })
          throw new Error('Force rollback')
        })
      } catch {
        // Expected
      }

      await module.assertDatabaseMissing('user', { id: 'tx-rollback-user' })
    })
  })

  describe('Database Assertions', () => {
    it('assertDatabaseHas finds existing record', async () => {
      const db = await module.getDb()
      await new UserFactory().withEmail('exists@test.com').create(db)

      await module.assertDatabaseHas('user', { email: 'exists@test.com' })
    })

    it('assertDatabaseMissing confirms non-existence', async () => {
      await module.assertDatabaseMissing('user', { email: 'nonexistent@test.com' })
    })

    it('assertDatabaseCount matches expected count', async () => {
      const db = await module.getDb()
      await new UserFactory().count(5).createManyAndReturn(db)

      await module.assertDatabaseCount('user', 5)
    })
  })

  describe('Error Handling', () => {
    it('throws on duplicate email (unique constraint)', async () => {
      const db = await module.getDb()
      await new UserFactory().withEmail('duplicate@test.com').create(db)

      await expect(
        new UserFactory().withEmail('duplicate@test.com').create(db)
      ).rejects.toThrow()
    })

    it('throws on invalid foreign key (authorId)', async () => {
      const db = await module.getDb()

      await expect(
        new PostFactory().forAuthor('nonexistent-user-id').create(db)
      ).rejects.toThrow()
    })

    it('throws when record not found', async () => {
      const db = await module.getDb()

      await expect(
        db.user.findUniqueOrThrow({ where: { id: 'nonexistent-id' } })
      ).rejects.toThrow()
    })
  })

  describe('Truncation', () => {
    it('truncateDb clears all tables', async () => {
      const db = await module.getDb()
      await new UserFactory().count(3).createManyAndReturn(db)
      await module.assertDatabaseCount('user', 3)

      await module.truncateDb()

      await module.assertDatabaseCount('user', 0)
    })
  })

  describe('Seeders', () => {
    it('seeds users via UserSeeder', async () => {
      await module.seed(new UserSeeder())

      await module.assertDatabaseHas('user', { email: 'admin@test.com', role: 'admin' })
      await module.assertDatabaseHas('user', { email: 'user@test.com', role: 'user' })
      await module.assertDatabaseHas('user', { email: 'unverified@test.com', emailVerified: false })
      await module.assertDatabaseCount('user', 3)
    })
  })
})
