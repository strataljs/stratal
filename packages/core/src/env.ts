/**
 * Cloudflare Worker Environment Bindings
 *
 * This interface defines the base environment bindings required by Stratal.
 * Use TypeScript module augmentation to add your own application-specific bindings.
 *
 * @example
 * ```typescript
 * declare module 'stratal' {
 *   interface StratalEnv {
 *     DATABASE: D1Database
 *     NOTIFICATIONS_QUEUE: Queue
 *   }
 * }
 * ```
 */
export interface StratalEnv {
  ENVIRONMENT: string;
  CACHE: KVNamespace;
}
