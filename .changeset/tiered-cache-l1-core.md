---
"stratal": patch
---

Add an opt-in isolate-local L1 cache tier and back queue idempotency with it.

- New `TieredCacheService` (`CACHE_TOKENS.TieredCacheService`) layers an isolate-local in-memory L1 over `CacheService` (KV). It gives read-after-write coherence within an isolate, closing KV's eventual-consistency gap (a `get` can otherwise return an edge-cached value for up to ~60s after a `put`). Same API as `CacheService` plus `binding(name)`, which memoizes a tiered instance per binding so each KV namespace keeps a stable, isolate-lifetime L1.
- L1 semantics: caches string-backed values only (`text`/`json`); `put`/`delete` are write-through; `text` reads back-populate; `arrayBuffer`/`stream` reads and non-string writes bypass and invalidate L1; `getWithMetadata`/`list` always read KV. FIFO-bounded.
- Queue idempotency claims and failed-job storage (`QueueStore`) now run through `TieredCacheService`, so a message redelivered to the same warm isolate is de-duplicated even inside KV's consistency window. Delivery remains at-least-once with best-effort de-duplication, not exactly-once. `QueueModule` now imports `CacheModule`.
- `CacheService` stays a thin KV wrapper (eventually consistent) and gains a `binding(name)` helper plus a `namespace` getter. Use it — not the tiered cache — for read-modify-write counters that need cross-edge freshness (e.g. rate limiting), where an isolate-local L1 would read its own stale value and miss other isolates' writes.
