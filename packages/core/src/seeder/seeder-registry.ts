import type { Application } from '../application'
import type { Container } from '../di/container'
import type { Constructor } from '../types'
import { SeederError } from './seeder.error'
import { type Seeder, SEEDER_INTERNALS } from './seeder'

export const SEEDER_TOKENS = {
  SeederRegistry: Symbol.for('stratal:seeders:registry'),
} as const

export class SeederRegistry {
  private seeders = new Set<Constructor<Seeder>>()
  private nameIndex = new Map<string, Constructor<Seeder>>()

  constructor(private app: Application) { }

  register(SeederClass: Constructor<Seeder>): void {
    const existing = this.nameIndex.get(SeederClass.name)
    if (existing && existing !== SeederClass) {
      throw new SeederError(`Seeder name collision: "${SeederClass.name}" is already registered`)
    }
    this.seeders.add(SeederClass)
    this.nameIndex.set(SeederClass.name, SeederClass)
  }

  async run(SeederClass: Constructor<Seeder>, options?: { container?: Container }): Promise<void> {
    if (!this.seeders.has(SeederClass)) {
      throw new SeederError(`Seeder "${SeederClass.name}" is not registered`)
    }

    const execute = async (container: Container) => {
      const seeder = container.resolve<Seeder>(SeederClass)
      seeder[SEEDER_INTERNALS] = {
        run: (cls) => this.run(cls, { container }),
        container,
      }
      await seeder.run()
    }

    if (options?.container) {
      await execute(options.container)
    } else {
      const mockContext = this.app.createMockRouterContext('en')
      await this.app.container.runInRequestScope(mockContext, execute)
    }
  }

  async runAll(options?: { container?: Container }): Promise<void> {
    for (const SeederClass of this.seeders) {
      await this.run(SeederClass, options)
    }
  }

  find(name: string): Constructor<Seeder> | undefined {
    return this.nameIndex.get(name)
  }

  has(SeederClass: Constructor<Seeder>): boolean {
    return this.seeders.has(SeederClass)
  }

  list(): { className: string }[] {
    return [...this.seeders].map(cls => ({ className: cls.name }))
  }
}
