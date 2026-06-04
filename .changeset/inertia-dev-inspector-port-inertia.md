---
"@stratal/inertia": patch
---

Add `--inspector-port` option to `inertia:dev` for configuring the worker debugger inspector port

Set a distinct port per worker to avoid `EADDRINUSE` when running multiple Inertia workers concurrently, or pass `false` to disable the inspector entirely.
