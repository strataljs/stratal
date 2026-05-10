---
"stratal": patch
---

Warn when a scheduled cron trigger doesn't match any registered job

`CronManager` now logs a warning (with the incoming cron expression and the list of registered schedules) when Cloudflare invokes a `scheduled()` trigger that no `@Cron` job is registered for. Previously the call returned silently, making misconfigured cron triggers in `wrangler.toml` invisible.
