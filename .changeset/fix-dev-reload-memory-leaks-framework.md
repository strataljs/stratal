---
"@stratal/framework": patch
---

Close database connections on application shutdown

### Details

- Database clients now disconnect their underlying pools when the application shuts down (including dev-server hot reloads), instead of leaking connections until the process exits
- Database clients also implement the async-disposal contract (`Symbol.asyncDispose`), so they participate in container disposal
