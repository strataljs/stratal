import { Module } from '../module/module.decorator'
import { SEEDER_TOKENS, SeederRegistry } from './seeder-registry'

/**
 * Registers the seeder registry (`SEEDER_TOKENS.SeederRegistry`).
 *
 * Eager: resolved synchronously at bootstrap (`registerSeeders`) and by the
 * test harness (`@stratal/testing`), so it cannot be lazily loaded.
 * {@link SeederRegistry} injects the `Application` via `DI_TOKENS.Application`.
 */
@Module({
  providers: [
    { provide: SEEDER_TOKENS.SeederRegistry, useClass: SeederRegistry },
  ],
})
export class SeederModule { }
