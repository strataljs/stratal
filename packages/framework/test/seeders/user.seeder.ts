import { Seeder } from '@stratal/testing'
import type { DatabaseService } from '../../src/database/database.service'

export const ADMIN_USER_ID = 'admin-user-id'
export const REGULAR_USER_ID = 'regular-user-id'
export const UNVERIFIED_USER_ID = 'unverified-user-id'

export class UserSeeder extends Seeder {
  async run(db: DatabaseService): Promise<void> {
    const [admin, regular, unverified] = await Promise.all([
      db.user.create({
        data: {
          id: ADMIN_USER_ID,
          email: 'admin@test.com',
          name: 'Admin User',
          emailVerified: true,
          role: 'admin',
        },
      }),
      db.user.create({
        data: {
          id: REGULAR_USER_ID,
          email: 'user@test.com',
          name: 'Regular User',
          emailVerified: true,
          role: 'user',
        },
      }),
      db.user.create({
        data: {
          id: UNVERIFIED_USER_ID,
          email: 'unverified@test.com',
          name: 'Unverified User',
          emailVerified: false,
          role: 'user',
        },
      })
    ])

    // Create account records for each user (required for Better Auth session lookup)
    await db.account.createMany({
      data: [
        {
          accountId: admin.id,
          providerId: 'credential',
          userId: admin.id,
          password: 'hashed-password',
        },
        {
          accountId: regular.id,
          providerId: 'credential',
          userId: regular.id,
          password: 'hashed-password',
        },
        {
          accountId: unverified.id,
          providerId: 'credential',
          userId: unverified.id,
          password: 'hashed-password',
        }
      ],
    })
  }
}
