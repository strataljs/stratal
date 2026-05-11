---
"@stratal/inertia-modal": patch
---

Preserve query string and forwarded headers on modal background requests

- The background page request now keeps the referer URL's query string, so opening a modal no longer resets the parent list view's filter/pagination state to defaults.
- `x-forwarded-proto`, `x-forwarded-host`, `x-forwarded-for`, `x-forwarded-port`, `x-real-ip`, `accept-language`, and `user-agent` are forwarded from the original request when present. Middleware that reconstructs the canonical request URL (e.g. apps whose `appUrl` is derived from forwarded headers) now sees the same protocol/host as the original request, fixing background fetches that previously appeared unauthenticated because Better Auth's secure-cookie prefix was resolved against the wrong base URL.
