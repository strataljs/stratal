---
"stratal": patch
---

Replace `StratalWorker` class with `Stratal` entry point. The new `Stratal` class is a plain object (not a `WorkerEntrypoint` subclass) that lazily initializes the application and exposes `fetch`, `queue`, and `scheduled` handlers directly. This removes the dependency on `cloudflare:workers` and simplifies the worker setup from a class with an abstract `configure()` method to a single `new Stratal({ module: AppModule })` call.

**Breaking change:** `StratalWorker` and the `stratal/worker` export have been removed. Migrate by replacing:

```ts
// Before
import { StratalWorker } from 'stratal/worker'

export default class Backend extends StratalWorker<Env> {
  protected configure() {
    return { module: AppModule }
  }
}

// After
import { Stratal } from 'stratal'

export default new Stratal({ module: AppModule })
```
