---
"stratal": patch
---

Improve middleware error handling and defer routing initialization for better performance

- Add `MiddlewareNextCalledMultipleTimesError` to detect and report when `next()` is called more than once in a middleware.
- Defer routing and handler initialization until first request for improved cold-start performance.
- Improve `isApplicationError` type guard with structural fallback for cross-module boundary cases.
