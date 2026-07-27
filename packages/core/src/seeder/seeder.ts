import type { Container } from '../di/container'
import type { Constructor } from '../types'

export const SEEDER_INTERNALS = Symbol.for('stratal:seeder:internals')

export interface SeederContext {
  run(SeederClass: Constructor<Seeder>): Promise<void>
  container: Container | null
}

export abstract class Seeder {
  [SEEDER_INTERNALS]: SeederContext = {
    run: () => { throw new Error('SeederRegistry not available') },
    container: null,
  }

  abstract run(): Promise<void>

  /** Call another seeder (like Laravel's $this->call()) */
  protected async call(SeederClass: Constructor<Seeder>): Promise<void> {
    await this[SEEDER_INTERNALS].run(SeederClass)
  }
}
