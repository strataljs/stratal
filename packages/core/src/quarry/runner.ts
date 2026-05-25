// CLI-only subpath. Heavy: pulls in every built-in command class — including
// `McpServeCommand` and `McpToolsCommand`, whose dynamic
// `import('@modelcontextprotocol/sdk/...')` would otherwise land in every
// worker's Vite dep optimizer via the shared `stratal/quarry` chunk.
//
// Only `src/quarry.ts` (the CLI entry resolved by the `quarry` bin) should
// import from here. `src/index.ts` (the worker entry) must never reach it.
export { BuiltinQuarryModule } from './builtin-quarry.module'
export { ApiCommand } from './commands/api.command'
export { EventListCommand } from './commands/event-list.command'
export { HelpCommand } from './commands/help.command'
export { McpServeCommand } from './commands/mcp-serve.command'
export { McpToolsCommand } from './commands/mcp-tools.command'
export { QueueListCommand } from './commands/queue-list.command'
export { RouteListCommand } from './commands/route-list.command'
export { RouteTypesCommand } from './commands/route-types.command'
export { ScheduleListCommand } from './commands/schedule-list.command'
export { QuarryRunner, type QuarryRunOptions } from './quarry-runner'
