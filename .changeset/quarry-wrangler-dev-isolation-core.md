---
"stratal": patch
---

Prevent `quarry` from breaking a concurrent `wrangler dev` session

Running a Quarry command while `wrangler dev` was active could overwrite the worker's entry in the local dev registry, causing peer workers to fail service-binding RPC calls (e.g. `couldn't find a local dev session for the X entrypoint`). Quarry now registers its ephemeral miniflare under a unique per-process worker name, leaving the running dev session's registry entry untouched.
