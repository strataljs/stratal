import { inject } from '../../di'
import { Singleton } from '../../di/decorators'
import { LOGGER_TOKENS, type LoggerService } from '../../logger'
import { CachePurgeError } from '../errors'
import { RESPONSE_CACHE_TOKENS } from '../response-cache.tokens'
import { renderTags, type TagScopes } from '../tag-template'
import type { PurgesCacheOptions } from '../types'

// Declared on `StratalExecutionContext` so the foundational module does not
// have to depend on this feature to describe `ctx.cache`. Re-exported here (and
// from `stratal/response-cache`) so consumers import them alongside the API
// that uses them.
import type { PurgeSpec, WorkersCache } from '../../execution-context'

export type { PurgeSpec, WorkersCache }

@Singleton(RESPONSE_CACHE_TOKENS.ResponseCacheService)
export class ResponseCacheService {
  constructor(
    @inject(LOGGER_TOKENS.LoggerService) private readonly logger: LoggerService,
  ) {}

  /** Render a `@PurgesCache` declaration against this request's scopes. */
  buildPurgeSpec(options: PurgesCacheOptions, scopes: TagScopes): PurgeSpec {
    if (options.purgeEverything) return { purgeEverything: true }

    const spec: PurgeSpec = {}
    if (options.tags?.length) spec.tags = renderTags(options.tags, scopes)
    if (options.pathPrefixes?.length) spec.pathPrefixes = [...options.pathPrefixes]

    return spec
  }

  /**
   * Issue a purge and wait for it.
   *
   * Deliberately not deferred through `waitUntil`: a client that re-reads
   * immediately after its own write must not be served the pre-write response.
   *
   * @throws {CachePurgeError} The mutation has already committed at this point,
   *   so failing loudly is the lesser evil against a cache that is silently
   *   inconsistent with the database.
   */
  async purge(spec: PurgeSpec, cache: WorkersCache): Promise<void> {
    try {
      const result = await cache.purge(spec)

      if (result && ! result.success) {
        this.logger.error('[stratal:response-cache] Purge reported failure', { spec })
        throw new CachePurgeError(`the runtime reported failure for ${JSON.stringify(spec)}`)
      }
    } catch (error) {
      if (error instanceof CachePurgeError) throw error

      this.logger.error('[stratal:response-cache] Purge threw', {
        spec,
        error: error instanceof Error ? error.message : String(error),
      })
      throw new CachePurgeError(error instanceof Error ? error.message : String(error))
    }
  }
}
