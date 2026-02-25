# 06 - Queues

Queue producer/consumer pattern using Cloudflare Queues.

## What it demonstrates

- `QueueModule.forRootAsync()` for configuring the queue provider
- `QueueModule.registerQueue()` for registering named queues
- Module augmentation for type-safe queue names (`QueueNames`)
- `@InjectQueue()` to inject a queue sender into a controller
- `IQueueConsumer` for processing queue messages
- `DispatchMessage` with `type` and `payload`

## Running

```bash
cd examples/06-queues
npx wrangler dev
```

## Testing

```bash
# Dispatch a notification to the queue
curl -X POST http://localhost:8787/api/notifications \
  -H 'Content-Type: application/json' \
  -d '{"to": "user@example.com", "subject": "Welcome", "body": "Hello!"}'
```

The consumer will log the notification processing in the wrangler console output.

## Key files

- [`src/types/queues.ts`](src/types/queues.ts) - Queue name and env augmentation
- [`src/app.module.ts`](src/app.module.ts) - Queue root configuration
- [`src/notifications/notifications.module.ts`](src/notifications/notifications.module.ts) - Feature module with queue registration
- [`src/notifications/notifications.controller.ts`](src/notifications/notifications.controller.ts) - Queue producer (dispatches messages)
- [`src/notifications/notification.consumer.ts`](src/notifications/notification.consumer.ts) - Queue consumer (processes messages)
