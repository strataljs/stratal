---
"stratal": patch
---

Align the Quarry CLI dev runtime with `wrangler dev`

The Quarry CLI now builds its local environment directly from your Wrangler config via Miniflare, so bindings, `vars`, and `.dev.vars` / `.env` files resolve exactly as they do under `wrangler dev` (including environment-specific `.env.<environment>` files loaded by `--env`).

- **Shared R2 state** — R2 buckets now persist to `.wrangler/state/v3/r2`, so data written by Quarry commands and `wrangler dev` is shared.
- **Parallel dev environments** — set `WRANGLER_REGISTRY_PATH` to isolate the dev service registry, allowing multiple dev environments to run side by side without service-binding collisions. Quarry also discovers a running `wrangler dev` session so service bindings resolve against it.
- **SMTP/socket support** — outbound TCP/TLS (e.g. sending email over SMTP) now works when running under Quarry.
- **Queues and events in commands** — CLI commands can now dispatch to queues and emit events, with listeners wired automatically.
