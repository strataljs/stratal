# 08 - OpenAPI

OpenAPI documentation with Scalar UI and richly documented routes.

## What it demonstrates

- `OpenAPIModule.forRoot()` to enable API documentation
- Zod schemas with `.openapi('SchemaName')` for named OpenAPI components
- `@Route()` with `summary`, `description`, and `tags` fields
- `@Controller()` with `tags` option for grouping routes
- Scalar UI for interactive API exploration

## Running

```bash
cd examples/08-openapi
npx wrangler dev
```

## Endpoints

| URL                          | Description             |
|------------------------------|-------------------------|
| http://localhost:8787/api/docs         | Scalar UI              |
| http://localhost:8787/api/openapi.json | Raw OpenAPI spec       |
| http://localhost:8787/api/users        | Users CRUD API         |

## Key files

- [`src/app.module.ts`](src/app.module.ts) - OpenAPI module configuration
- [`src/users/users.schemas.ts`](src/users/users.schemas.ts) - Zod schemas with `.openapi()` metadata
- [`src/users/users.controller.ts`](src/users/users.controller.ts) - Documented controller routes
