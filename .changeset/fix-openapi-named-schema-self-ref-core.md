---
"stratal": patch
---

Fix a `named()` schema used directly as a request body or response being emitted as an empty, self-referencing OpenAPI component

- Affected the built-in `ErrorResponse`, so generated documents were unusable in most clients
- A named schema referenced only from inside another schema was already correct and is unchanged
