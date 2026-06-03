import { inject } from '../di/decorators'
import type { Container } from '../di/container'
import { DI_TOKENS } from '../di/tokens'
import { LOGGER_TOKENS, type LoggerService } from '../logger'
import type { Constructor } from '../types'
import { ModuleRef } from './module-ref'
import type { ModuleRegistry } from './module-registry'
import type { DynamicModule, ModuleClass } from './types'

/**
 * Loads modules on demand (NestJS-style), so optional features stay out of the
 * cold-start path until first use.
 *
 * Inject {@link DI_TOKENS.LazyModuleLoader} and call {@link load}:
 *
 * ```ts
 * const ref = await loader.load(() => import('./reports.module').then(m => m.ReportsModule))
 * const reports = ref.get(ReportService)
 * ```
 *
 * The loaded module's nested `imports` and `providers` are registered into the
 * global container and its `onInitialize` hook runs once. Controllers, queue
 * consumers, and cron jobs are skipped — that wiring is finalized at bootstrap.
 * Repeat loads of the same module return the cached {@link ModuleRef} without
 * re-registering.
 */
export class LazyModuleLoader {
  private readonly cache = new Map<Constructor, ModuleRef>()
  private readonly inFlight = new Map<Constructor, Promise<ModuleRef>>()

  constructor(
    @inject(DI_TOKENS.ModuleRegistry) private readonly registry: ModuleRegistry,
    @inject(DI_TOKENS.Container) private readonly container: Container,
    @inject(LOGGER_TOKENS.LoggerService) private readonly logger: LoggerService,
  ) { }

  async load(loaderFn: () => Promise<ModuleClass | DynamicModule>): Promise<ModuleRef> {
    const loaded = await loaderFn()
    const { moduleClass } = this.registry.resolveModule(loaded)

    const cached = this.cache.get(moduleClass)
    if (cached) return cached

    const inFlight = this.inFlight.get(moduleClass)
    if (inFlight) return inFlight

    const promise = this.registerAndBuild(moduleClass, loaded)
    this.inFlight.set(moduleClass, promise)
    try {
      return await promise
    } finally {
      this.inFlight.delete(moduleClass)
    }
  }

  private async registerAndBuild(
    moduleClass: Constructor,
    loaded: ModuleClass | DynamicModule,
  ): Promise<ModuleRef> {
    this.logger.debug(`Lazy loading module: ${moduleClass.name}`)
    await this.registry.registerLazy(loaded)
    const ref = new ModuleRef(this.container.getRootContainer(), moduleClass)
    this.cache.set(moduleClass, ref)
    return ref
  }
}
