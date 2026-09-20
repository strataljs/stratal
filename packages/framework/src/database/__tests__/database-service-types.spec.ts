import type { RuntimePlugin } from '@zenstackhq/orm'
import type { SchemaDef } from '@zenstackhq/orm/schema'
import { describe, expectTypeOf, it } from 'vitest'
import type { DatabaseService } from '../database.service'
import type { CursorReader } from '../pagination/cursor-reader'
import type { DeclaredMembers, ExtractPluginClientMembers } from '../types'

/**
 * `DatabaseService` intersects the members every client carries onto the ZenStack
 * client type. These guard the two ways that can quietly stop working — neither
 * of which fails anything else.
 *
 * Note: this project does not enable vitest's typecheck mode, so under
 * `vitest run` the `expectTypeOf` assertions below are runtime no-ops — this
 * file passes green even when the types it guards are broken. Only
 * `yarn workspace @stratal/framework typecheck` (`tsc --noEmit`) actually
 * enforces them; that's the command CI relies on to catch a regression here.
 */
describe('DatabaseService built-in client members', () => {
  it('carries $cursor, typed against the connection\'s schema', () => {
    // Fails if the member stops being intersected on, or stops being
    // parameterised by the connection's schema — either of which leaves
    // `db.$cursor.post` resolving to nothing rather than erroring where it broke.
    expectTypeOf<DatabaseService['$cursor']>()
      .toEqualTypeOf<CursorReader<NonNullable<DatabaseService['$schema']>>>()
  })

  it('does not let an index signature reach the client', () => {
    // The regression this guards is specific and past. `ExtClientMembers` is
    // constrained to `Record<string, unknown>`, so a member type passed through
    // that slot carries an index signature; one reaching the client survives
    // `$transaction`'s `Omit` and collapses every model delegate on a
    // transaction client to `unknown`. An index signature makes
    // `keyof DatabaseService` absorb `string`, so every undeclared name starts
    // resolving — which is the shape that then collapses the transaction client.
    expectTypeOf<'anyUndeclaredMember' extends keyof DatabaseService ? true : false>()
      .toEqualTypeOf<false>()
  })
})

/**
 * `DeclaredMembers` and `ExtractPluginClientMembers` are exported for consumers
 * typing a client augmentation of their own, so they are covered against a
 * fixture plugin rather than against a framework one.
 */
declare class FixturePlugin implements RuntimePlugin<SchemaDef, {}, { $fixture: () => string }, {}> {
  readonly id: 'fixture'
  readonly client: { $fixture: () => string } & Record<string, unknown>
}

describe('plugin client member extraction', () => {
  it('reads a plugin\'s declared members', () => {
    expectTypeOf<keyof DeclaredMembers<ExtractPluginClientMembers<FixturePlugin>>>()
      .toEqualTypeOf<'$fixture'>()
  })

  it('strips the index signature the plugin contract forces', () => {
    // Unstripped, `keyof` widens to `string | number` and this fails.
    expectTypeOf<string extends keyof DeclaredMembers<ExtractPluginClientMembers<FixturePlugin>> ? true : false>()
      .toEqualTypeOf<false>()
  })
})
