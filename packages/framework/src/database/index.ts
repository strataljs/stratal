/**
 * Augmentable database configuration interface.
 *
 * Declared here (in the barrel) so that `declare module '@stratal/framework/database'`
 * augmentations merge into this module directly, avoiding TypeScript's re-export
 * forking limitation (microsoft/TypeScript#18877).
 *
 * @example
 * ```typescript
 * declare module '@stratal/framework/database' {
 *   interface StratalDatabase {
 *     schemas: {
 *       main: MainSchemaType
 *       tenant: TenantSchemaType
 *     }
 *     defaultConnection: 'main'
 *   }
 * }
 * ```
 */
export interface StratalDatabase {}

export * from './database.module'
export * from './database.service'
export * from './database.tokens'
export * from './decorators/inject-db.decorator'
export * from './errors'
export * from './event-types'
export * from './i18n'
export * from './plugins'
export * from './types'

export { ZenStackCommand } from './commands/zenstack.command'
export { DbGenerateCommand } from './commands/db-generate.command'
export { DbPullCommand } from './commands/db-pull.command'
export { DbPushCommand } from './commands/db-push.command'
export { MigrateDeployCommand } from './commands/migrate-deploy.command'
export { MigrateDevCommand } from './commands/migrate-dev.command'
export { MigrateResetCommand } from './commands/migrate-reset.command'
export { MigrateStatusCommand } from './commands/migrate-status.command'

