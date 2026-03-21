# Gotchas & Troubleshooting

## Cloudflare Workers Constraints

- **No Node.js APIs** — No `fs`, `path`, `process`, `child_process`. Use Workers-compatible alternatives.
- **No dynamic `require()`** — ESM-only. Use `import`.
- **Execution time limits** — Workers have CPU time limits (10ms free, 30s paid). Long-running tasks should use queues.
- **Memory limits** — 128MB. Avoid loading large datasets into memory.
- **No `__dirname` / `__filename`** — ESM doesn't have these. Use `import.meta.url` if needed.

## tsyringe Quirks

### Missing @Transient()

**Symptom:** "No injectable constructor" error at runtime.

**Fix:** Add `@Transient()` to every class resolved via DI. `@Controller()` applies it automatically, but services, repositories, listeners, seeders, and commands all need it.

### Missing reflect-metadata

**Symptom:** Decorator metadata not available, DI fails silently.

**Fix:** The `Stratal` class imports `reflect-metadata` automatically. For tests, add `import 'reflect-metadata'` in `vitest.setup.ts`.

### Wrong tsconfig Settings

**Symptom:** Decorators don't work, DI fails.

**Fix:** Ensure both are `true` in `tsconfig.json`:
```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### Importing from tsyringe directly

**Symptom:** Works but breaks Stratal conventions and may cause issues with tree-shaking.

**Fix:** Always import `inject`, `injectable`, `singleton`, etc. from `stratal/di`, not `tsyringe`.

## Common Mistakes

### Importing z from wrong package

**Wrong:** `import { z } from 'zod'`
**Right:** `import { z } from 'stratal/validation'`

Stratal wraps Zod with i18n support. Direct `zod` imports bypass validation message translation.

### Mixing routing patterns

**Wrong:** Using both `@Route()` and `@Get()`/`@Post()` in the same controller.
**Right:** Pick one pattern per controller. Convention-based (`@Route()`) or explicit (`@Get()`, `@Post()`, etc.).

### Missing wrangler.jsonc cron trigger

**Symptom:** Cron job registered but never fires.

**Fix:** The `schedule` in your `CronJob` must exactly match a trigger in `wrangler.jsonc`:
```jsonc
{ "triggers": { "crons": ["0 2 * * *"] } }
```

### Queue consumer not receiving messages

**Symptom:** Messages dispatched but consumer's `handle()` never called.

**Causes:**
1. Consumer not in module's `consumers` array (not `providers`)
2. `messageTypes` doesn't match the dispatched `type` field
3. Queue binding missing from `wrangler.jsonc`
4. `QueueModule.registerQueue('queue-name')` not called in module imports

### Token not registered

**Symptom:** "Token not registered" error.

**Fix:** Ensure the provider is registered in a module's `providers` array AND that module is imported (directly or transitively) by the root module.

### Dynamic module missing `module` property

**Symptom:** Lifecycle hooks (configure, onInitialize, onShutdown) not called.

**Fix:** `forRoot()`/`forRootAsync()` return must include `module: MyModule`:
```typescript
static forRoot(): DynamicModule {
  return {
    module: MyModule,  // Required!
    providers: [...],
  }
}
```

### Database Type Augmentation

If TypeScript doesn't recognize model names on `DatabaseService`, you need module augmentation:

```typescript
declare module '@stratal/framework/database' {
  interface StratalDatabase {
    schemas: { main: SchemaType }
    defaultConnection: 'main'
  }
}
```

### Missing StratalEnv augmentation

**Symptom:** `DI_TOKENS.CloudflareEnv` resolves to `unknown` or type errors with env bindings.

**Fix:** Create `src/types/env.ts`:
```typescript
declare module 'stratal' {
  interface StratalEnv extends Cloudflare.Env {}
}
```

And run `wrangler types` to generate the `Cloudflare.Env` type.

## Performance Tips

- Use `Scope.Singleton` for stateless services to avoid re-instantiation
- Use queues for CPU-intensive work to stay within Workers limits
- Use cache for frequently-read, rarely-changing data
- Keep controller methods thin — delegate to services
