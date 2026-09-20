/**
 * Remove `modulesRules` from a sourceless quarry worker's Miniflare options,
 * returning whether anything was removed.
 *
 * `modulesRules` tells Miniflare how to interpret files it pulls off disk when
 * it assembles a worker's module graph (`.sql` as Text, `.wasm` as CompiledWasm,
 * and so on). The quarry CLI host has no module graph: it runs an
 * empty script (`script: ''`) purely to own a worker's bindings for command code
 * executing in Node, so no file is ever matched against a rule and the option
 * cannot change how this host behaves.
 *
 * It has to be dropped rather than passed through. Miniflare 5 replaced the flat
 * v4 worker shape with a `workers` array, and its `convertV4MiniflareOptions()`
 * bridge refuses any input carrying `modulesRules` — it has no v5 equivalent to
 * map onto, so converting would silently lose behaviour and it throws instead.
 * Wrangler's `unstable_getMiniflareWorkerOptions()` always emits the key
 * (`config.rules` concatenated with its own defaults, so never empty), which
 * means every quarry boot on wrangler ≥4.124 hits that guard and dies before the
 * command runs.
 *
 * Dropping it is only sound *because* the host is sourceless — a worker that
 * actually loads modules would need these rules honoured, not discarded.
 */
export function stripModuleRules(workerOptions: Record<string, unknown>): boolean {
  if (workerOptions.modulesRules === undefined) return false
  delete workerOptions.modulesRules
  return true
}
