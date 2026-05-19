import type { ExceptionHandler } from '../errors'
import { LogLevel } from '../logger/contracts/log-level'
import { Module } from '../module/module.decorator'
import type { Seeder } from '../seeder/seeder'
import { Stratal } from '../stratal'
import type { Constructor } from '../types'

export interface QuarryRunOptions {
  /** Root application module — typically the same `AppModule` the worker uses. */
  module: Constructor
  /** Seeder classes to register only for CLI runs. Each must extend `Seeder`. */
  seeders?: Constructor<Seeder>[]
  /** Optional custom exception handler. Same shape as `Stratal({ exceptionHandler })`. */
  exceptionHandler?: Constructor<ExceptionHandler>
}

/**
 * Builds a `Stratal` instance for the quarry CLI entry (`src/quarry.ts`).
 *
 * Synthesizes a module that imports the user's `AppModule` and registers
 * any seeders as providers — so seeder classes stay out of the worker
 * bundle (`src/index.ts` doesn't reference them). Forces CLI-friendly
 * logging defaults (`level: 'error'`, `formatter: 'pretty'`).
 *
 * @example
 * ```ts
 * // src/quarry.ts
 * export default QuarryRunner.run({
 *   module: AppModule,
 *   seeders: [GeoSeeder, DemoSeeder],
 * })
 * ```
 */
export class QuarryRunner {
  static run(options: QuarryRunOptions): Stratal {
    @Module({
      imports: [options.module],
      providers: options.seeders ?? [],
    })
    class QuarryEntryModule {}

    return new Stratal({
      module: QuarryEntryModule,
      exceptionHandler: options.exceptionHandler,
      logging: { level: LogLevel.ERROR, formatter: 'pretty' },
    })
  }
}
