# 16 - Workers

Durable Objects, Workflows, and Worker Entrypoints with full dependency injection using `stratal/workers`.

## What it demonstrates

- `StratalDurableObject` base class for Durable Objects with request-scoped DI
- `StratalWorkflow` base class for multi-step Workflows with DI access in each step
- `StratalWorkerEntrypoint` base class for RPC entrypoints with DI
- Shared `TaskService` injected across all three worker primitives and the HTTP controller
- Domain-based module organization with `TaskModule`
- Durable Object storage for per-user state (task counter)
- Workflow steps for multi-stage task processing
- Loopback RPC via `cloudflare:workers` `exports` for same-worker entrypoint calls

## Running

```bash
cd examples/16-workers
npm install
npx wrangler dev
```

## API endpoints

| Method | Path                         | Description                                      |
|--------|------------------------------|--------------------------------------------------|
| GET    | /api/tasks?userId=:userId    | List tasks for a user                            |
| POST   | /api/tasks                   | Create a task and increment DO counter           |
| GET    | /api/tasks/:id               | Get a task via RPC loopback export               |
| POST   | /api/tasks/:id/process       | Start the task processing workflow               |
| GET    | /api/tasks/user/:userId/count| Get per-user task count from Durable Object      |

## Example requests

```bash
# Create a task — increments the per-user Durable Object counter
curl -X POST http://localhost:8787/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title": "Write docs", "userId": "user-1"}'

# Get a task via RPC loopback export
curl http://localhost:8787/api/tasks/<id>

# Start the task processing workflow
curl -X POST http://localhost:8787/api/tasks/<id>/process

# Check the per-user task count from Durable Object storage
curl http://localhost:8787/api/tasks/user/user-1/count

# List tasks for a user
curl http://localhost:8787/api/tasks?userId=user-1
```

Watch the wrangler console to see `[TaskCounter]` and `[Workflow]` log output.

## Project structure

```
src/
├── app.module.ts              — Root module that imports TaskModule
├── env.d.ts                   — Cloudflare env type augmentation
├── index.ts                   — Stratal entry point with named exports for DO, Workflow, and Entrypoint
└── task/
    ├── task.module.ts          — Task domain module declaring controllers, providers
    ├── task.service.ts         — Shared injectable service used across all worker primitives
    ├── task.controller.ts      — HTTP controllers that orchestrate all three primitives
    ├── task-counter.ts         — StratalDurableObject with per-user counter using DO storage + DI
    ├── task-rpc.ts             — StratalWorkerEntrypoint for RPC task lookup via loopback exports
    └── task-workflow.ts        — StratalWorkflow with validate → process → complete steps
```
