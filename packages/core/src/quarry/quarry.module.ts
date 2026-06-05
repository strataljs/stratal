import { DI_TOKENS } from '../di/tokens'
import { Module } from '../module/module.decorator'
import { QuarryRegistry } from './quarry-registry'

/**
 * Registers the Quarry command registry (`DI_TOKENS.Quarry`).
 *
 * Eager: resolved synchronously at bootstrap (`registerCommands`) and by the
 * CLI runner (`bin/quarry.ts`), so it cannot be lazily loaded.
 */
@Module({
  providers: [
    { provide: DI_TOKENS.Quarry, useClass: QuarryRegistry },
  ],
})
export class QuarryModule { }
