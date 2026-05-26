import { inject } from '../../di'
import { Singleton } from '../../di/decorators'
import { DI_TOKENS } from '../../di/tokens'
import type { Application } from '../../application'
import { VERSION_NEUTRAL } from '../constants'
import type { VersioningOptions } from '../types'

/**
 * Resolves version prefixes for route paths.
 *
 * Handles VERSION_NEUTRAL, multi-version arrays, default version fallback,
 * and configurable prefix (default: 'v').
 *
 * Registered as a singleton in the container.
 */
@Singleton()
export class VersioningService {
  private readonly options: VersioningOptions | null

  constructor(@inject(DI_TOKENS.Application) app: Application) {
    this.options = app.config.versioning ?? null
  }

  /** Whether versioning is enabled */
  get enabled(): boolean {
    return this.options !== null
  }

  /**
   * Resolve versioned paths for a base path.
   *
   * @param basePath - The base path (e.g., '/users')
   * @param version - Explicit version from controller/router config
   * @returns Array of versioned path strings (e.g., ['/v1/users', '/v2/users'])
   */
  resolve(basePath: string, version?: string | string[] | typeof VERSION_NEUTRAL): string[] {
    // Versioning disabled — return base path as-is
    if (!this.options) {
      return [basePath]
    }

    // VERSION_NEUTRAL — explicitly opt out of versioning
    if (version === VERSION_NEUTRAL) {
      return [basePath]
    }

    const prefix = this.options.prefix ?? 'v'

    // Explicit version(s) on the controller/router
    if (version !== undefined) {
      const versions = Array.isArray(version) ? version : [version]
      return versions.map(v => `/${prefix}${v}${basePath}`)
    }

    // No explicit version — apply defaultVersion if set
    if (this.options.defaultVersion !== undefined) {
      const defaults = Array.isArray(this.options.defaultVersion)
        ? this.options.defaultVersion
        : [this.options.defaultVersion]
      return defaults.map(v => `/${prefix}${v}${basePath}`)
    }

    // Versioning enabled but no version and no default — no prefix
    return [basePath]
  }
}
