import type { AnyPlugin, ClientOptions, ComputedFieldsOptions } from '@zenstackhq/orm';
import type { SchemaDef } from '@zenstackhq/schema';
import { DI_TOKENS, lazy } from 'stratal/di';
import type { IEventRegistry } from 'stratal/events';
import { I18nModule } from 'stratal/i18n';
import {
    Module,
    type AsyncModuleOptions,
    type DynamicModule,
    type LazyModuleLoader,
    type ModuleContext,
    type OnInitialize,
    type OnShutdown,
} from 'stratal/module';
import { DbGenerateCommand } from './commands/db-generate.command';
import { DbPullCommand } from './commands/db-pull.command';
import { DbPushCommand } from './commands/db-push.command';
import { MigrateDeployCommand } from './commands/migrate-deploy.command';
import { MigrateDevCommand } from './commands/migrate-dev.command';
import { MigrateResetCommand } from './commands/migrate-reset.command';
import { MigrateStatusCommand } from './commands/migrate-status.command';
import { createDatabaseService } from './database.helpers';
import { connectionSymbol, DATABASE_TOKENS } from './database.tokens';
import { databaseMessages } from './i18n';
import type { ConnectionName, DefaultConnectionName } from './types';

export interface DatabaseConnectionConfig<
  Schema extends SchemaDef = SchemaDef,
  Name extends ConnectionName = ConnectionName,
> {
  name: Name
  schema: Schema
  dialect: () => ClientOptions<SchemaDef>['dialect']
  plugins?: AnyPlugin[]
  /**
   * Schema-level @computed field implementations. Required when the schema
   * declares any `@computed` fields. Keyed by uncapitalized model name; values
   * map field name to a Kysely-expression compute callback.
   */
  computedFields?: ComputedFieldsOptions<Schema>
}

export interface DatabaseModuleConfig {
  default: DefaultConnectionName
  connections: DatabaseConnectionConfig[]
}

@Module({
  imports: [
    I18nModule.registerMessages({ en: { database: databaseMessages.en } }),
  ],
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

  async onInitialize(context: ModuleContext): Promise<void> {
    const config = context.container.resolve<DatabaseModuleConfig>(DATABASE_TOKENS.Options)
    // EventRegistry is loaded on demand — pull in EventsModule via the loader.
    const loader = context.container.resolve<LazyModuleLoader>(DI_TOKENS.LazyModuleLoader)
    const eventsRef = await loader.load(() => import('stratal/events').then((m) => m.EventsModule))
    const eventRegistry = eventsRef.get<IEventRegistry>(DI_TOKENS.EventRegistry)
    for (const conn of config.connections) {
      const Service = createDatabaseService(conn, eventRegistry);

      context.container.register(connectionSymbol(conn.name), lazy(() => Service))
    }

    context.container.registerExisting(DI_TOKENS.Database, connectionSymbol(config.default))

    context.logger.info('DatabaseModule initialized')
  }

  onShutdown(context: ModuleContext): void {
    context.logger.info('DatabaseModule shutdown')
  }
}
