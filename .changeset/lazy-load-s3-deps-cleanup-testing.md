---
"@stratal/testing": patch
---

Add dedicated `@stratal/testing/storage` sub-path export and add `reflect-metadata` as peer dependency

### Details

- `FakeStorageService` and `StoredFile` are no longer exported from the main entry point — import from `@stratal/testing/storage` instead
- Add `reflect-metadata` as a peer dependency
