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

@Module({})
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
