---
"stratal": patch
---

Add failed-job storage, idempotent dispatch, and queue management CLI commands

- Messages that exhaust their retry attempts are persisted to a KV-backed store so they can be inspected and replayed.
- New Quarry commands to manage failed jobs:
  - `queue:failed` — list failed jobs (filter with `--queue`, cap with `--limit`).
  - `queue:retry` — re-dispatch a job by id, a whole queue (`--queue`), or everything (`--all`).
  - `queue:purge` — delete a failed job by id, a whole queue (`--queue`), or everything (`--all`).
- Messages stay auto-idempotent: every dispatch carries an idempotency key (an explicit `metadata.idempotencyKey`, otherwise a deterministic SHA-256 hash of `type` + `payload`), and an already-processed message is skipped. `idempotency.ttl` bounds how long processed keys are remembered (default 24h).
- Failed jobs persist indefinitely until retried or purged. Register the opt-in `FailedJobCleanupJob` cron (in a module's `jobs` array) to delete failed jobs older than `failedJobs.retention` (default 7 days); use `failedJobCleanupJob(schedule)` for a custom schedule.
- The KV store binding is validated at app boot: a missing binding throws a clear, actionable `QueueError` during module initialization instead of failing on every queue invocation.
- Queue state (idempotency claims and failed jobs) is stored in a KV namespace that defaults to the `CACHE` binding; override it with `store: { binding: 'YOUR_KV' }` in the queue module options.
