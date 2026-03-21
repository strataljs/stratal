import type { AnyPlugin } from '@zenstackhq/orm'
import type { SchemaDef } from '@zenstackhq/schema'
import type { Dialect } from 'kysely'
import { DI_TOKENS, Scope, delay } from 'stratal/di'
import type { IEventRegistry } from 'stratal/events'
import {
  InjectionToken,
  Module,
  type AsyncModuleOptions,
  type DynamicModule,
  type ModuleContext,
  type OnInitialize,
  type OnShutdown,
} from 'stratal/module'
import { DbGenerateCommand } from './commands/db-generate.command'
import { DbPullCommand } from './commands/db-pull.command'
import { DbPushCommand } from './commands/db-push.command'
import { MigrateDeployCommand } from './commands/migrate-deploy.command'
import { MigrateDevCommand } from './commands/migrate-dev.command'
import { MigrateResetCommand } from './commands/migrate-reset.command'
import { MigrateStatusCommand } from './commands/migrate-status.command'
import { createDatabaseService } from './database.helpers'
import { DATABASE_TOKENS, connectionSymbol } from './database.tokens'
import type { ConnectionName, DefaultConnectionName } from './types'

export interface DatabaseConnectionConfig<
  Schema extends SchemaDef = SchemaDef,
  Name extends ConnectionName = ConnectionName,
> {
  name: Name
  schema: Schema
  dialect: () => Dialect
  plugins?: AnyPlugin[]
}

export interface DatabaseModuleConfig {
  default: DefaultConnectionName
  connections: DatabaseConnectionConfig[]
}

@Module({
  providers: [
    DbGenerateCommand,
    DbPushCommand,
    DbPullCommand,
    MigrateDevCommand,
    MigrateDeployCommand,
    MigrateStatusCommand,
    MigrateResetCommand,
  ],
})
export class DatabaseModule implements OnInitialize, OnShutdown {
  static forRoot(config: DatabaseModuleConfig): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        { provide: DATABASE_TOKENS.Options, useValue: config as unknown as object },
      ],
    }
  }

  static forRootAsync(options: AsyncModuleOptions<DatabaseModuleConfig>): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: DATABASE_TOKENS.Options,
          useFactory: options.useFactory,
          inject: options.inject,
        },
      ],
    }
  }

  onInitialize(context: ModuleContext): void {
    const config = context.container.resolve<DatabaseModuleConfig>(DATABASE_TOKENS.Options)
    const eventRegistry = context.container.resolve<IEventRegistry>(DI_TOKENS.EventRegistry)
    const container = context.container.getTsyringeContainer();

    for (const conn of config.connections) {
      const Service = createDatabaseService(conn, eventRegistry)

      container.register(connectionSymbol(conn.name) as InjectionToken<symbol>,
        // @ts-expect-error Overload error
        delay(() => Service),
        { lifecycle: Scope.Request })
    }

    context.container.registerExisting(DI_TOKENS.Database, connectionSymbol(config.default))

    context.logger.info('DatabaseModule initialized')
  }

  onShutdown(context: ModuleContext): void {
    context.logger.info('DatabaseModule shutdown')
  }
}
