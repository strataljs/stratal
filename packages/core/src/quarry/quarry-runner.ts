import type { ExceptionHandler } from '../errors'
import { LogLevel } from '../logger/contracts/log-level'
import { Module } from '../module/module.decorator'
import { Stratal } from '../stratal'
import type { Constructor } from '../types'

export interface QuarryRunOptions {
  /**
   * Modules to register for the CLI run. Always includes the app's root
   * module (e.g., `AppModule`); additional entries are typically CLI-only
   * command modules from stratal ecosystem packages (e.g.,
   * `InertiaQuarryModule` from `@stratal/inertia/quarry`). Anything listed
   * here stays out of the worker bundle because `src/index.ts` doesn't
   * import it.
   */
  imports: Constructor[]
  /**
   * Provider classes registered only for the CLI run — typically seeders
   * (classes extending `Seeder`) and other CLI-only services. Placed into a
   * synthesized wrapper module's `providers` so they go through the
   * standard DI registration path.
   */
  providers?: Constructor[]
  /** Optional custom exception handler. Same shape as `Stratal({ exceptionHandler })`. */
  exceptionHandler?: Constructor<ExceptionHandler>
}

/**
 * Builds a `Stratal` instance for the quarry CLI entry (`src/quarry.ts`).
 *
 * Synthesizes a wrapper module from the given `imports` and `providers`,
 * so CLI-only classes (seeders, ecosystem CLI commands) stay out of the
 * worker bundle — `src/index.ts` doesn't reference any of them. Forces
 * CLI-friendly logging defaults (`level: 'error'`, `formatter: 'pretty'`).
 *
 * @example
 * ```ts
 * // src/quarry.ts
 * export default QuarryRunner.run({
 *   imports: [AppModule, InertiaQuarryModule],
 *   providers: [GeoSeeder, DemoSeeder],
 * })
 * ```
 */
export class QuarryRunner {
  static run(options: QuarryRunOptions): Stratal {
    @Module({
      imports: options.imports,
      providers: options.providers ?? [],
    })
    class QuarryEntryModule {}

    return new Stratal({
      module: QuarryEntryModule,
      exceptionHandler: options.exceptionHandler,
      logging: { level: LogLevel.ERROR, formatter: 'pretty' },
    })
  }
}
