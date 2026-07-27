/**
 * Stub for the `cloudflare:workers` runtime built-in, which has no Node
 * resolution. Alias `cloudflare:workers` to this module in the vitest config of
 * any package whose **node** test project imports code that statically imports
 * `cloudflare:workers` (e.g. `stratal/cache`'s `waitUntil`):
 *
 * ```ts
 * resolve: { alias: { 'cloudflare:workers': '@stratal/testing/mocks/cloudflare-workers' } }
 * ```
 *
 * Tests that run in miniflare get the real module and must NOT alias this.
 * Specs asserting behaviour mock it with `vi.mock` / `vi.doMock`, which takes
 * precedence over the alias.
 */

/** Runs the work synchronously so assertions on the underlying call still see it. */
export function waitUntil(promise: Promise<unknown>): void {
  void Promise.resolve(promise).catch(() => {
    /* swallow rejections in tests; specs that care assert via their own mock */
  })
}

export const env: Record<string, unknown> = {}

export class WorkerEntrypoint {}
export class WorkflowEntrypoint {}
export class DurableObject {}
export class RpcTarget {}
