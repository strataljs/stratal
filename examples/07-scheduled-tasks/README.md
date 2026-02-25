# 07 - Scheduled Tasks

Cron job scheduling using the `CronJob` interface.

## What it demonstrates

- `CronJob` interface with `schedule` and `execute()`
- Optional `onError()` handler for failed jobs
- Registering jobs in a module via `@Module({ jobs: [...] })`
- Wrangler `triggers.crons` configuration
- `StratalWorker.scheduled()` handler (inherited from base class)

## Running

```bash
cd examples/07-scheduled-tasks
npx wrangler dev
```

To trigger cron jobs locally, use the `__scheduled` endpoint:

```bash
# Trigger all scheduled handlers
curl http://localhost:8787/__scheduled
```

## Cron schedules

| Job           | Schedule        | Description                |
|---------------|-----------------|----------------------------|
| CleanupJob    | `0 2 * * *`     | Daily at 2:00 AM UTC      |
| HeartbeatJob  | `*/5 * * * *`   | Every 5 minutes            |

## Key files

- [`src/jobs/jobs.module.ts`](src/jobs/jobs.module.ts) - Jobs module
- [`src/jobs/cleanup.job.ts`](src/jobs/cleanup.job.ts) - Daily cleanup job
- [`src/jobs/heartbeat.job.ts`](src/jobs/heartbeat.job.ts) - Heartbeat job
- [`wrangler.jsonc`](wrangler.jsonc) - Cron trigger configuration
