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
import { createDatabaseService, type DatabaseServiceClass } from './database.helpers';
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
  private readonly services: DatabaseServiceClass[] = []

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
    // Awaited, because `forRootAsync` takes a factory typed
    // `TOptions | Promise<TOptions>` and a container resolves it to whatever it
    // returned. Read without awaiting, an async factory hands this a Promise and
    // the loop below walks `undefined` connections — the type permitting exactly
    // what the runtime broke on.
    //
    // What that buys a consumer is a schema behind an `import()`: a generated
    // schema is a large object literal, and a static import evaluates it while
    // the isolate starts, where the runtime's startup budget is. Awaiting here
    // lets it be imported when the module initializes instead.
    const config = await context.container.resolve<DatabaseModuleConfig | Promise<DatabaseModuleConfig>>(
      DATABASE_TOKENS.Options,
    )
    // EventRegistry is loaded on demand — pull in EventsModule via the loader.
    const loader = context.container.resolve<LazyModuleLoader>(DI_TOKENS.LazyModuleLoader)
    const eventsRef = await loader.load(() => import('stratal/events').then((m) => m.EventsModule))
    const eventRegistry = eventsRef.get<IEventRegistry>(DI_TOKENS.EventRegistry)
    for (const conn of config.connections) {
      const Service = createDatabaseService(conn, eventRegistry);

      this.services.push(Service)
      context.container.register(connectionSymbol(conn.name), lazy(() => Service))
    }

    context.container.registerExisting(DI_TOKENS.Database, connectionSymbol(config.default))

    context.logger.info('DatabaseModule initialized')
  }

  async onShutdown(context: ModuleContext): Promise<void> {
    // Disconnect every live client so pools/sockets don't outlive the
    // Application across dev-server hot reloads.
    await Promise.all(this.services.map(service => service.disposeInstances(context.logger)))
    this.services.length = 0
    context.logger.info('DatabaseModule shutdown')
  }
}
