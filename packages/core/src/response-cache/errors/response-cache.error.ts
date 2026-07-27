import { ApplicationError } from '../../errors'

/** A rendered `Cache-Tag` value Cloudflare would silently drop. */
export class InvalidCacheTagError extends ApplicationError {
  constructor(tag: string, reason: string) {
    super(`[stratal:response-cache] Invalid Cache-Tag "${tag}": ${reason}`)
  }
}

/** A purge failed after its mutation already committed. */
export class CachePurgeError extends ApplicationError {
  constructor(detail: string, cause?: unknown) {
    super(`[stratal:response-cache] Cache purge failed: ${detail}`, cause)
  }
}

/** Misconfiguration detected at boot. */
export class ResponseCacheConfigError extends ApplicationError {
  constructor(detail: string) {
    super(`[stratal:response-cache] ${detail}`)
  }
}
