# 04 - Guards

Route protection using `@UseGuards` and the `CanActivate` interface.

## What it demonstrates

- Custom guard implementing `CanActivate`
- `@UseGuards()` at the class level to protect all routes
- Injecting environment variables into guards via `DI_TOKENS.CloudflareEnv`
- Module augmentation to add `API_KEY` to `StratalEnv`

## Running

```bash
cd examples/04-guards
npx wrangler dev
```

## Testing the guard

```bash
# Without API key - returns 403
curl http://localhost:8787/api/articles

# With valid API key - returns articles
curl http://localhost:8787/api/articles -H 'x-api-key: my-secret-api-key'
```

## Key files

- [`src/auth/api-key.guard.ts`](src/auth/api-key.guard.ts) - API key guard
- [`src/articles/articles.controller.ts`](src/articles/articles.controller.ts) - Protected controller
- [`src/index.ts`](src/index.ts) - Module augmentation for `StratalEnv`
