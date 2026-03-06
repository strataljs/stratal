import { Seeder } from '@stratal/testing'
import type { DatabaseService } from '../../src/database/database.service'
import { ADMIN_USER_ID, REGULAR_USER_ID } from './user.seeder'

export class RbacSeeder extends Seeder {
  async run(db: DatabaseService): Promise<void> {
    // Role assignments (g type = grouping policy)
    await db.casbinRule.createMany({
      data: [
        { ptype: 'g', v0: ADMIN_USER_ID, v1: 'admin' },
        { ptype: 'g', v0: REGULAR_USER_ID, v1: 'user' },
        // Policies (p type = permission policy)
        // Admin gets all actions on all resources
        { ptype: 'p', v0: 'admin', v1: 'users:*', v2: '.*' },
        { ptype: 'p', v0: 'admin', v1: 'posts:*', v2: '.*' },
        { ptype: 'p', v0: 'admin', v1: 'admin:*', v2: '.*' },
        // Role hierarchy (g type = grouping policy for role inheritance)
        { ptype: 'g', v0: 'super_admin', v1: 'admin' },
        // Regular user gets limited access
        { ptype: 'p', v0: 'user', v1: 'posts:read', v2: 'get' },
        { ptype: 'p', v0: 'user', v1: 'posts:create', v2: 'post' }
      ],
    })
  }
}
