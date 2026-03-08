import type { AnyPlugin } from '@zenstackhq/orm'
import type { SchemaDef } from '@zenstackhq/schema'
import type { Dialect } from 'kysely'
import { DI_TOKENS } from 'stratal/di'
import type { IEventRegistry } from 'stratal/events'
import {
  Module,
  type AsyncModuleOptions,
  type DynamicModule,
  type ModuleContext,
  type OnInitialize,
  type OnShutdown,
} from 'stratal/module'
import { instanceCachingFactory } from 'tsyringe'
import { createDatabaseService } from './database.helpers'
import { DATABASE_TOKENS, connectionSymbol } from './database.tokens'
import { DatabaseConfigError } from './errors/database-config.error'

export interface DatabaseConnectionConfig {
  name: string
  schema: SchemaDef
  dialect: () => Dialect
  plugins?: AnyPlugin[]
}

export interface DatabaseModuleConfig {
  default: string
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
    const container = context.container.getTsyringeContainer()

    for (const conn of config.connections) {
      container.register(connectionSymbol(conn.name), {
        useFactory: instanceCachingFactory((c) => {
          const resolvedConfig = c.resolve<DatabaseModuleConfig>(DATABASE_TOKENS.Options)
          const resolvedConn = resolvedConfig.connections.find(
            connection => connection.name === conn.name
          )

          if (!resolvedConn) {
            throw new DatabaseConfigError('Connection not found');
          }

          const eventRegistry = c.resolve<IEventRegistry>(DI_TOKENS.EventRegistry)
          return createDatabaseService(resolvedConn, eventRegistry)
        })
      })
    }

    context.container.registerExisting(DI_TOKENS.Database, connectionSymbol(config.default))

    context.logger.info('DatabaseModule initialized')
  }

  onShutdown(context: ModuleContext): void {
    context.logger.info('DatabaseModule shutdown')
  }
}
