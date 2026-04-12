---
"stratal": patch
---

Resolve cron jobs from request-scoped DI container at execution time

### Breaking Changes

- `CronManager.registerJob()` now accepts `(schedule, jobClass)` instead of a `CronJob` instance. Jobs are resolved from the container at execution time, ensuring request-scoped dependencies (e.g. database connections) are properly scoped.
- `CronManager.executeScheduled()` now requires a `Container` as its second argument.
- `CronManager.getJobsForSchedule()` returns `RegisteredJob[]` instead of `CronJob[]`.
