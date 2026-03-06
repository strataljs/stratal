# 14 - Factories

Test data factories with Faker.js integration, state modifiers, and `Sequence` utilities.

## What it demonstrates

- `Factory<TModel, TCreateInput>` abstract class with `definition()` for default attributes
- `state()` modifiers for building variants (`admin()`, `unverified()`, `expensive()`)
- Method chaining: `new UserFactory().admin().unverified().count(3).makeMany()`
- `Sequence` utility with custom transformers for sequential values (emails, SKUs)
- `count(n)` + `makeMany()` for bulk in-memory generation
- `this.faker` (Faker.js) integration for realistic data
- Difference between `make()` (in-memory) vs `create()` (database — not used here since no DB)

## Running

```bash
cd examples/14-factories
npm install
npx wrangler dev
```

## API endpoints

| Method | Path                         | Description                       |
|--------|------------------------------|-----------------------------------|
| GET    | /api/demo/users              | Generate fake users               |
| GET    | /api/demo/admins             | Generate fake admin users         |
| GET    | /api/demo/products           | Generate fake products            |
| GET    | /api/demo/expensive-products | Generate expensive products       |
| GET    | /api/demo/mixed              | Generate mixed data with states   |

## Example requests

```bash
# Generate 5 random users (default)
curl http://localhost:8787/api/demo/users

# Generate 10 random users
curl http://localhost:8787/api/demo/users?count=10

# Generate admin users
curl http://localhost:8787/api/demo/admins

# Generate products
curl http://localhost:8787/api/demo/products

# Generate expensive products
curl http://localhost:8787/api/demo/expensive-products

# Generate mixed data with chained states
curl http://localhost:8787/api/demo/mixed
```

## Key files

- [`src/factories/user.factory.ts`](src/factories/user.factory.ts) - User factory with `admin()`, `unverified()` states and email `Sequence`
- [`src/factories/product.factory.ts`](src/factories/product.factory.ts) - Product factory with `expensive()`, `outOfStock()` states and SKU `Sequence`
- [`src/demo/demo.controller.ts`](src/demo/demo.controller.ts) - Endpoints demonstrating factory usage patterns
