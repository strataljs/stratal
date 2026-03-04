import type { ConnectionName, DefaultConnectionName, DatabaseService } from '@stratal/framework/database'

export abstract class Seeder<K extends ConnectionName = DefaultConnectionName> {
  abstract run(db: DatabaseService<K>): Promise<void>
}
