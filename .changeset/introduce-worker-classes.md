---
"stratal": patch
---

Add worker base classes (`StratalDurableObject`, `StratalWorkerEntrypoint`, `StratalWorkflow`) with DI support and request-scoped containers

### Details

- Introduce `stratal/workers` sub-path export with `StratalDurableObject`, `StratalWorkerEntrypoint`, `StratalWorkflow`, and `runInScope` helper
- Add `Stratal.resolveApplication()` static method for worker classes to access the DI container
- Add `StratalNotInitializedError` for when `resolveApplication()` is called before Stratal is instantiated
- Add `DurableObjectState` and `DurableObjectId` DI tokens for Durable Object context injection
