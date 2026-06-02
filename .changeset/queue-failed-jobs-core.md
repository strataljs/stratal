---
"stratal": patch
---

Add failed-job storage, idempotent dispatch, and queue management CLI commands

- Messages that exhaust their retry attempts are persisted to a KV-backed store so they can be inspected and replayed.
- New Quarry commands to manage failed jobs:
  - `queue:failed` — list failed jobs (filter with `--queue`, cap with `--limit`).
  - `queue:retry` — re-dispatch a job by id, a whole queue (`--queue`), or everything (`--all`).
  - `queue:purge` — delete a failed job by id, a whole queue (`--queue`), or everything (`--all`).
- Dispatched messages now carry an idempotency key (derived automatically from the message type and payload, or set explicitly via `metadata.idempotencyKey`) so duplicate deliveries are skipped.
- Queue state (idempotency keys and failed jobs) is stored in a KV namespace that defaults to the `CACHE` binding; override it with `store: { binding: 'YOUR_KV' }` in the queue module options.
