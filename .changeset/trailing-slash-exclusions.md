---
"stratal": patch
"@stratal/inertia": patch
---

Trailing-slash exclusions: `trailingSlash` accepts `{ mode, exclude }`

### Details

- `trailingSlash` application config now accepts `{ mode, exclude }` alongside a bare mode. Excluded paths are never redirected (308) and never rewritten by URL generation — for routes whose canonical form is owned externally (e.g. OAuth redirect URIs matched byte-for-byte).
- String patterns are segment-aware prefixes; RegExp patterns match both slash forms of the pathname regardless of anchoring.
- Exclusions match in route space: with path-based locale detection, a leading locale segment is stripped before matching, so `'/callback'` also exempts `/fr/callback` — in the redirect middleware, `Uri` helpers, and hreflang link generation.
- `@stratal/inertia` threads the widened config through hreflang URL generation and shares only the resolved mode with the React client (exclusions are server-side; excluded paths are served in both slash forms, so client-built URLs never redirect).
- New exports from `stratal/router`: `resolveTrailingSlash`, `isTrailingSlashExcluded`, and the `TrailingSlashConfig` / `TrailingSlashOptions` / `TrailingSlashExclude` types.
