---
"@stratal/framework": patch
---

Add pagination plugin for ZenStack database client

### Details

- Add `paginationPlugin` with `$resource.paginate()` for offset-based pagination and `$resource.cursorPaginate()` for cursor-based pagination
- Plugin is auto-registered on all database connections via `createDatabaseService`
- Add `ResourceClientExtension` type to `DatabaseService` for type-safe access to `$resource` methods
- `paginate()` runs `findMany` and `count` in parallel, returns `{ data, pagination }` compatible with `ctx.collection()`
- `cursorPaginate()` uses fetch-one-extra strategy, returns `{ data, nextCursor, hasMore, limit }` compatible with `ctx.cursorCollection()`
