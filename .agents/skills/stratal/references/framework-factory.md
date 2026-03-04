# Factory

## Installation

```bash
npm install @stratal/framework
npm install @faker-js/faker                  # required peer dep for factory
```

## Factory Class

Abstract base class for creating test data. Requires `@faker-js/faker` as a peer dependency.

```typescript
import { Factory } from '@stratal/framework/factory'
import { type User, type UserCreateInput } from '../zenstack'

export class UserFactory extends Factory<User, UserCreateInput> {
  protected model = 'user'

  protected definition(): UserCreateInput {
    return {
      email: this.faker.internet.email(),
      firstName: this.faker.person.firstName(),
      lastName: this.faker.person.lastName(),
      emailVerified: true,
    }
  }

  admin() {
    return this.state((attrs) => ({ ...attrs, role: 'admin' }))
  }

  verified() {
    return this.state((attrs) => ({ ...attrs, emailVerified: true }))
  }
}
```

### Generic Parameters

```typescript
abstract class Factory<TModel, TCreateInput>
```

- `TModel` — the database entity type (returned from `create`)
- `TCreateInput` — the input type for creation (e.g., Prisma/ZenStack create args)

### Abstract Members

| Member | Type | Description |
|--------|------|-------------|
| `model` | `string` | Model name matching the database client property (e.g., `'user'`) |
| `definition()` | `() => TCreateInput` | Returns default attribute values |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `faker` | `Faker` | Faker.js instance (readonly, protected) |

### API

| Method | Signature | Description |
|--------|-----------|-------------|
| `make()` | `() => TCreateInput` | Generate single instance attributes |
| `makeMany(count?)` | `(count?: number) => TCreateInput[]` | Generate multiple instance attributes |
| `create(db)` | `(db: DatabaseService) => Promise<TModel>` | Create single instance in database |
| `createMany(db, count?)` | `(db: DatabaseService, count?: number) => Promise<{ count: number }>` | Create multiple instances |
| `createManyAndReturn(db, count?)` | `(db: DatabaseService, count?: number) => Promise<TModel[]>` | Create multiple and return all |
| `state(modifier)` | `(modifier: (attrs: TCreateInput) => Partial<TCreateInput>) => this` | Add state modifier (returns clone) |
| `count(n)` | `(n: number) => this` | Set batch count (returns clone) |

### Usage Patterns

```typescript
const factory = new UserFactory()

// Unit tests — no database needed
const attrs = factory.make()
const manyAttrs = factory.makeMany(5)

// Integration tests — creates in database
const user = await factory.create(db)
const users = await factory.count(10).createManyAndReturn(db)

// Chaining states
const admins = await factory.admin().count(3).createManyAndReturn(db)
```

**Immutability:** `state()` and `count()` return clones — the original factory is never modified.

## Sequence Class

Generates sequential values for factories:

```typescript
import { Sequence } from '@stratal/framework/factory'

const emailSeq = new Sequence((n) => `user${n}@example.com`)

emailSeq.next()  // 'user1@example.com'
emailSeq.next()  // 'user2@example.com'
emailSeq.peek()  // 'user3@example.com' (no increment)
emailSeq.reset()
emailSeq.next()  // 'user1@example.com'
```

### Constructor

```typescript
class Sequence<T = number> {
  constructor(private readonly generator?: (n: number) => T)
}
```

- Without generator: returns incrementing numbers
- With generator: transforms the counter

### API

| Method | Signature | Description |
|--------|-----------|-------------|
| `next()` | `() => T` | Increment counter and return value |
| `peek()` | `() => T` | Preview next value without incrementing |
| `reset()` | `() => void` | Reset counter to 0 |

### Factory Integration

```typescript
const orderSeq = new Sequence((n) => `ORD-${String(n).padStart(6, '0')}`)

export class OrderFactory extends Factory<Order, OrderCreateInput> {
  protected model = 'order'

  protected definition(): OrderCreateInput {
    return {
      orderNumber: orderSeq.next(),
      total: this.faker.number.float({ min: 10, max: 500 }),
    }
  }
}
```

## Import Path

```typescript
import { Factory, Sequence } from '@stratal/framework/factory'
```
