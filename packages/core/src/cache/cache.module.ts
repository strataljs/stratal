/**
 * Cache Module
 *
 * Provides key-value caching capabilities using Cloudflare KV namespaces.
 *
 * **Features:**
 * - Type-safe KV wrapper with full method coverage
 * - Multiple KV binding support via `withBinding()`
 * - Automatic error handling with security-focused logging
 * - Singleton service for optimal performance
 */

import { Module } from '../module'
import { CACHE_TOKENS } from './cache.tokens'
import { CacheService } from './services'

@Module({
  providers: [
    // Singleton - CacheService has no request dependencies
    { provide: CACHE_TOKENS.CacheService, useClass: CacheService },
  ],
})
export class CacheModule {}
