---
"@stratal/framework": patch
---

Support `@computed` fields in `DatabaseModule` connection config

`DatabaseConnectionConfig` accepts a new optional `computedFields` map that is forwarded to the underlying ZenStack client. ZenStack 3+ requires this whenever the schema declares any `@computed` fields; previously the connection failed to construct.
