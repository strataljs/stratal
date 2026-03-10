---
"@stratal/framework": patch
---

Refactor database module to use per-connection schemas instead of a shared schema with slicing

### Breaking Changes

**@stratal/framework**

- `DatabaseModuleConfig` no longer accepts a top-level `schema` property. Each connection in `connections` now requires its own `schema` property.
- `DatabaseConnectionConfig` no longer accepts `slicing`. Each connection defines its own schema, making slicing unnecessary.
- `StratalDatabase` augmentation interface changed: replace `schema` and `slicing` with `schemas` (a map of connection name to schema type).
  ```typescript
  // Before
  interface StratalDatabase {
    schema: SchemaType
    defaultConnection: 'main'
    slicing: {
      main: { includedModels: readonly ['User', 'Post'] }
      analytics: { includedModels: readonly ['AnalyticsEvent'] }
    }
  }

  // After
  interface StratalDatabase {
    schemas: {
      main: MainSchemaType
      analytics: AnalyticsSchemaType
    }
    defaultConnection: 'main'
  }
  ```
- Removed type exports: `InferDatabaseSchema`, `InferConnectionSlicing`
- Added type exports: `InferConnectionSchema<K>`, `InferAnySchema`
- Removed `@stratal/zenstack-plugin` package (no longer needed with per-connection schemas)
- Removed `slicing` support from database connections. Slicing will be re-added in a future release.
