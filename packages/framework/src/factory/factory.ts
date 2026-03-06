import { faker, type Faker } from '@faker-js/faker'
import type { DatabaseService } from '../database'

/**
 * Factory
 *
 * Abstract base class for creating test data.
 * Integrates with Faker.js for data generation.
 *
 * @example Define a factory
 * ```typescript
 * import { Factory } from '@stratal/framework/factory'
 * import type { User, UserCreateInput } from '@your-app/db'
 *
 * export class UserFactory extends Factory<User, UserCreateInput> {
 *   protected model = 'user'
 *
 *   protected definition(): UserCreateInput {
 *     return {
 *       email: this.faker.internet.email(),
 *       firstName: this.faker.person.firstName(),
 *       lastName: this.faker.person.lastName(),
 *       emailVerified: true,
 *     }
 *   }
 *
 *   admin() {
 *     return this.state(attrs => ({ ...attrs, role: 'admin' }))
 *   }
 * }
 * ```
 *
 * @example Usage
 * ```typescript
 * const user = await new UserFactory().create(ctx.db)
 * const admin = await new UserFactory().admin().create(ctx.db)
 * const users = await new UserFactory().count(10).createManyAndReturn(ctx.db)
 * ```
 */
export abstract class Factory<TModel, TCreateInput> {
  protected readonly faker: Faker = faker
  protected abstract model: string
  protected abstract definition(): TCreateInput

  private states: ((attrs: TCreateInput) => Partial<TCreateInput>)[] = []
  private _count = 1

  state(modifier: (attrs: TCreateInput) => Partial<TCreateInput>): this {
    const clone = this.clone()
    clone.states.push(modifier)
    return clone
  }

  count(n: number): this {
    const clone = this.clone()
    clone._count = n
    return clone
  }

  make(): TCreateInput {
    let attrs = this.definition()
    for (const modifier of this.states) {
      attrs = { ...attrs, ...modifier(attrs) }
    }
    return attrs
  }

  makeMany(count?: number): TCreateInput[] {
    const n = count ?? this._count
    return Array.from({ length: n }, () => this.make())
  }

  async create(db: DatabaseService): Promise<TModel> {
    const data = this.make()
    const model = (db as unknown as Record<string, { create: (args: { data: TCreateInput }) => Promise<TModel> }>)[this.model]
    return model.create({ data })
  }

  async createMany(db: DatabaseService, count?: number): Promise<{ count: number }> {
    const data = this.makeMany(count)
    const model = (db as unknown as Record<string, { createMany: (args: { data: TCreateInput[] }) => Promise<{ count: number }> }>)[this.model]
    return model.createMany({ data })
  }

  async createManyAndReturn(db: DatabaseService, count?: number): Promise<TModel[]> {
    const data = this.makeMany(count)
    const model = (db as unknown as Record<string, { createManyAndReturn: (args: { data: TCreateInput[] }) => Promise<TModel[]> }>)[this.model]
    return model.createManyAndReturn({ data })
  }

  protected clone(): this {
    const FactoryClass = this.constructor as new () => this
    const clone = new FactoryClass()
    clone.states = [...this.states]
    clone._count = this._count
    return clone
  }
}
