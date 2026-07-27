import { inject } from '../../di'
import { Singleton } from '../../di/decorators'
import { LOGGER_TOKENS, type LoggerService } from '../../logger'
import type { RouterContext } from '../../router/router-context'
import { ResponseCacheConfigError } from '../errors'
import { RESPONSE_CACHE_TOKENS } from '../response-cache.tokens'
import type { ResponseCacheModuleOptions } from '../types'

export interface PartitionResult {
  /** Values to place in `ctx.props`. Empty when nothing resolved. */
  props: Record<string, string>
  /** False when any declared partition could not be resolved — do not cache. */
  resolved: boolean
}

/**
 * Resolves the named partitions a route declared into `ctx.props` values.
 *
 * `ctx.props` is part of the Workers Caching cache key and, per Cloudflare,
 * "cannot be bypassed" — so this is what keeps one caller's cached response
 * from reaching another.
 */
@Singleton(RESPONSE_CACHE_TOKENS.PartitionResolverService)
export class PartitionResolverService {
  constructor(
    @inject(RESPONSE_CACHE_TOKENS.Options) private readonly options: ResponseCacheModuleOptions,
    @inject(LOGGER_TOKENS.LoggerService) private readonly logger: LoggerService,
  ) {}

  /** Throw at boot if a route names a partition with no registered resolver. */
  assertKnown(names: string[], where: string): void {
    const known = Object.keys(this.options.partitions ?? {})

    for (const name of names) {
      if (!known.includes(name)) {
        throw new ResponseCacheConfigError(
          `${where}: unknown partition "${name}". Register it via ` +
            `ResponseCacheModule.forRoot({ partitions: { ${name}: (ctx) => ... } }). ` +
            `Known partitions: ${known.length > 0 ? known.join(', ') : '(none)'}.`,
        )
      }
    }
  }

  /**
   * Partition names seen so far, split by whether they have ever resolved.
   *
   * A resolver that fails is ordinary traffic — an anonymous visitor to a
   * per-user route — so the per-request signal stays at `debug`. But a
   * partition that has *never* resolved is a configuration mistake, not
   * traffic: the usual cause is `partitions: { user: (ctx) => ctx.user().id }`
   * configured without `primers: AUTH_GATEWAY_PRIMERS`, so `ctx.user()` throws
   * on every request and the route is silently never cached. Warned once per
   * name, so that diagnosis is available without making normal misses noisy.
   */
  private readonly warnedUnresolved = new Set<string>()
  private readonly everResolved = new Set<string>()

  private noteUnresolved(name: string): void {
    if (this.everResolved.has(name) || this.warnedUnresolved.has(name)) return

    this.warnedUnresolved.add(name)
    this.logger.warn(
      `[stratal:response-cache] Partition "${name}" has never resolved; routes using it are ` +
        'not being cached. If its resolver calls `ctx.user()` or reads the request container, ' +
        'the gateway needs `primers` (e.g. `AUTH_GATEWAY_PRIMERS` from @stratal/framework) to ' +
        'populate that context before resolution runs.',
      { partition: name },
    )
  }

  async resolve(ctx: RouterContext, names: string[]): Promise<PartitionResult> {
    if (names.length === 0) return { props: {}, resolved: true }

    const partitions = this.options.partitions ?? {}
    const props: Record<string, string> = {}

    for (const name of names) {
      const resolver = partitions[name]
      if (!resolver) return { props: {}, resolved: false }

      let value: string | null | undefined
      try {
        value = await resolver(ctx)
      } catch (error) {
        // An anonymous request to a per-user route makes ctx.user() throw.
        // That is ordinary traffic, not a fault — it just is not cacheable.
        this.logger.debug('[stratal:response-cache] Partition resolver threw; not caching', {
          partition: name,
          error,
        })
        this.noteUnresolved(name)
        return { props: {}, resolved: false }
      }

      if (value === null || value === undefined) {
        this.logger.debug('[stratal:response-cache] Partition unresolved; not caching', { partition: name })
        this.noteUnresolved(name)
        return { props: {}, resolved: false }
      }

      this.everResolved.add(name)
      props[name] = value
    }

    return { props, resolved: true }
  }
}
