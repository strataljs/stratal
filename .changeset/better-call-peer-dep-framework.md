---
"@stratal/framework": patch
---

Add `better-call@1.3.5` as a direct dependency

`@better-auth/core@1.6.9` declares `better-call` as a peer dependency but does not install it itself, so the framework — its direct consumer — is responsible for providing it. Without it, stricter resolvers (e.g. Cloudflare's workerd vitest pool) fail to resolve `better-call/error` from `@better-auth/core`.
