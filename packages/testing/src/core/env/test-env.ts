import { type StratalEnv } from 'stratal'
import { env as cloudflareEnv } from 'cloudflare:test'

/**
 * Get test environment with optional overrides
 *
 * @param overrides - Optional partial env to merge with cloudflare:test env
 * @returns Complete Env object for testing
 */
export function getTestEnv(overrides?: Partial<StratalEnv>): StratalEnv {
  return {
    ...cloudflareEnv,
    ...overrides,
  } as StratalEnv
}
