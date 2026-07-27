import { databasePrefix } from '@stratal/testing/database'
import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { UserFactory } from '../factories/user.factory'
import { TestAppModule } from '../fixtures/app.module'

describe('per-file test runner', () => {
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

  it("connects to this file's OWN isolated database (…_f_<token>)", async () => {
    const db = module.getDb()
    const [{ current_database }] = await db.$queryRawUnsafe<{ current_database: string }[]>(
      'SELECT current_database()',
    )
    // Each test file gets its own database, named `<base>_f_<token>`. We can't
    // reconstruct the exact token here (it's generated inside the builder), but
    // the connection must be pointed at a per-file database (the sweep prefix),
    // never the base or template.
    expect(current_database).toContain('_f_')
    expect(current_database).not.toBe('stratal_test')
    expect(current_database).not.toContain('_template')
    // Sanity: the name matches the leak-sweep prefix so it gets reclaimed.
    expect(current_database.startsWith(databasePrefix('postgres://x/stratal_test'))).toBe(true)
  })

  it('creates a user (state for the next test to observe reset)', async () => {
    const db = module.getDb()
    await new UserFactory().create(db)

    await module.assertDatabaseCount('user', 1)
  })

  it('resets rows between tests (state from the prior test is gone)', async () => {
    // The previous test created a user; if `afterEach(truncateDb)` genuinely
    // reset state between tests, none of it survives here.
    await module.assertDatabaseCount('user', 0)
  })
})
