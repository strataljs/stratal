# Durable Objects, Workflows, and Worker Entrypoints

DI-aware base classes for the Cloudflare runtime classes that aren't routed through the normal `Stratal` fetch handler. Every method gets its own request-scoped container via `runInScope()`, so injected services behave the same way as in HTTP controllers.

## Durable Objects

Extend `StratalDurableObject` instead of `DurableObject` to access the DI container in DO methods.

```typescript
// src/domain/counter/counter.do.ts
import { StratalDurableObject } from 'stratal/workers'
import { CounterService } from './counter.service'

export class CounterDO extends StratalDurableObject {
  async increment() {
    return this.runInScope(async (container) => {
      const service = container.resolve(CounterService)
      return service.increment()
    })
  }

  async alarm() {
    return this.runInScope(async (container) => {
      const service = container.resolve(CounterService)
      await service.flush()
    })
  }
}
```

Inside the callback, the request container has `DI_TOKENS.DurableObjectState` (the DO's `ctx`) and `DI_TOKENS.DurableObjectId` registered, so services that need the DO state can `@inject` them.

```typescript
import { Transient, inject } from 'stratal/di'
import { DI_TOKENS } from 'stratal/di'

@Transient()
export class CounterService {
  constructor(
    @inject(DI_TOKENS.DurableObjectState) private state: DurableObjectState,
  ) {}

  async increment() {
    const value = (await this.state.storage.get<number>('count')) ?? 0
    await this.state.storage.put('count', value + 1)
    return value + 1
  }
}
```

Wire the DO in `wrangler.jsonc` as usual:

```jsonc
"durable_objects": {
  "bindings": [{ "name": "COUNTER", "class_name": "CounterDO" }]
}
```

Re-export the class from `src/index.ts` so Wrangler can find it:

```typescript
// src/index.ts
export { CounterDO } from './domain/counter/counter.do'
export default new Stratal({ module: AppModule })
```

## Cloudflare Workflows

Extend `StratalWorkflow<Env, Params>` instead of `WorkflowEntrypoint`. Use `runInScope` per step — each scope is independent.

```typescript
// src/domain/onboarding/onboarding.workflow.ts
import { StratalWorkflow } from 'stratal/workers'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'

interface OnboardingParams {
  userId: string
}

export class OnboardingWorkflow extends StratalWorkflow<Env, OnboardingParams> {
  async run(event: WorkflowEvent<OnboardingParams>, step: WorkflowStep) {
    await step.do('send welcome email', async () => {
      await this.runInScope(async (container) => {
        const email = container.resolve(EmailService)
        await email.send({ to: event.payload.userId, subject: 'Welcome' })
      })
    })

    await step.sleep('wait', '1 day')

    await step.do('send tips', async () => {
      await this.runInScope(async (container) => {
        const email = container.resolve(EmailService)
        await email.send({ to: event.payload.userId, subject: 'Pro tips' })
      })
    })
  }
}
```

Re-export from `src/index.ts` and wire in `wrangler.jsonc`:

```jsonc
"workflows": [{
  "name": "onboarding",
  "binding": "ONBOARDING",
  "class_name": "OnboardingWorkflow"
}]
```

## Service Bindings (RPC)

Extend `StratalWorkerEntrypoint<Env>` for RPC methods exposed to other Workers via `service:` bindings.

```typescript
// src/rpc/auth.rpc.ts
import { StratalWorkerEntrypoint } from 'stratal/workers'
import { AuthService } from '@stratal/framework/auth'

export class AuthRpc extends StratalWorkerEntrypoint {
  async verifyToken(token: string) {
    return this.runInScope(async (container) => {
      const auth = container.resolve(AuthService)
      return auth.verify(token)
    })
  }
}
```

Re-export from `src/index.ts` and bind in the consumer Worker's `wrangler.jsonc`:

```jsonc
"services": [{ "binding": "AUTH", "service": "auth-worker", "entrypoint": "AuthRpc" }]
```

## Standalone `runInScope`

For rare cases where you need a request-scoped container outside any of the base classes above (e.g., a custom queue handler):

```typescript
import { runInScope } from 'stratal/workers'

await runInScope(async (container) => {
  const svc = container.resolve(MyService)
  await svc.doWork()
})
```

## Sub-Path Import

`stratal/workers` — `StratalDurableObject`, `StratalWorkerEntrypoint`, `StratalWorkflow`, `runInScope`.
