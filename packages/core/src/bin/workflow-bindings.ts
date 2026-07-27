/**
 * Remove Workflow bindings from a sourceless quarry worker's Miniflare options,
 * returning the names removed so the caller can surface them.
 *
 * The quarry CLI worker runs an empty script (`script: ''`): it exists to host a
 * worker's bindings for command code running in Node, but defines no worker
 * module. A Workflow's engine binds to the `class_name` entrypoint of the worker
 * that declares it (Miniflare wires `USER_WORKFLOW` as a service binding to
 * `core:user:<scriptName>`, validated at boot), and an empty script exposes no
 * such entrypoint — so the runtime refuses to start.
 *
 * Redirecting the binding cross-script to the defining worker does not help in
 * local development: the quarry host boots its own Miniflare instance *before*
 * that worker exists (a worker's `dev` script boots the quarry host, then spawns
 * the worker), so the cross-script service is undefined at boot. Workflows also
 * cannot be remote bindings. A sourceless host therefore cannot run or reach a
 * Workflow; the binding is dropped here. Triggering a Workflow must happen from
 * the worker that defines it (e.g. an HTTP/queue handler), not the CLI host.
 */
export function stripWorkflowBindings(workerOptions: Record<string, unknown>): string[] {
  const workflows = workerOptions.workflows as Record<string, unknown> | undefined
  if (!workflows) return []
  const names = Object.keys(workflows)
  delete workerOptions.workflows
  return names
}
