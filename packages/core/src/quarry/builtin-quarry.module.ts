import { Module } from '../module/module.decorator'
import { DbSeedCommand, DbSeedListCommand } from '../seeder'
import { ApiCommand } from './commands/api.command'
import { EventListCommand } from './commands/event-list.command'
import { HelpCommand } from './commands/help.command'
import { McpServeCommand } from './commands/mcp-serve.command'
import { McpToolsCommand } from './commands/mcp-tools.command'
import { QueueListCommand } from './commands/queue-list.command'
import { RouteListCommand } from './commands/route-list.command'
import { RouteTypesCommand } from './commands/route-types.command'
import { ScheduleListCommand } from './commands/schedule-list.command'

/**
 * Built-in framework CLI commands.
 *
 * Registered automatically by `QuarryRunner` so they're available from
 * `src/quarry.ts` (CLI side). The worker entry (`src/index.ts`) never
 * imports this module, which keeps each command's transitive deps
 * (e.g. `@modelcontextprotocol/sdk` reached via `McpServeCommand`) out
 * of the worker bundle and the worker-env Vite dev optimizer.
 */
@Module({
  providers: [
    HelpCommand,
    DbSeedCommand,
    DbSeedListCommand,
    RouteListCommand,
    RouteTypesCommand,
    EventListCommand,
    ScheduleListCommand,
    QueueListCommand,
    McpServeCommand,
    McpToolsCommand,
    ApiCommand,
  ],
})
export class BuiltinQuarryModule {}
