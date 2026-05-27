import { Module } from '../module/module.decorator'
import { DbSeedCommand, DbSeedListCommand } from '../seeder'
import { ApiCommand } from './commands/api.command'
import { EventListCommand } from './commands/event-list.command'
import { HelpCommand } from './commands/help.command'
import { I18nCheckCommand } from './commands/i18n-check.command'
import { I18nDuplicatesCommand } from './commands/i18n-duplicates.command'
import { I18nListCommand } from './commands/i18n-list.command'
import { I18nNamespacesCommand } from './commands/i18n-namespaces.command'
import { I18nSearchCommand } from './commands/i18n-search.command'
import { I18nStatsCommand } from './commands/i18n-stats.command'
import { McpServeCommand } from './commands/mcp-serve.command'
import { McpToolsCommand } from './commands/mcp-tools.command'
import { QueueFailedCommand } from './commands/queue-failed.command'
import { QueueListCommand } from './commands/queue-list.command'
import { QueuePurgeCommand } from './commands/queue-purge.command'
import { QueueRetryCommand } from './commands/queue-retry.command'
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
    QueueFailedCommand,
    QueueRetryCommand,
    QueuePurgeCommand,
    McpServeCommand,
    McpToolsCommand,
    ApiCommand,
    I18nCheckCommand,
    I18nDuplicatesCommand,
    I18nListCommand,
    I18nNamespacesCommand,
    I18nSearchCommand,
    I18nStatsCommand,
  ],
})
export class BuiltinQuarryModule {}
