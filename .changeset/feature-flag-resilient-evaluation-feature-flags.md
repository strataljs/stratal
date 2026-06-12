---
"@stratal/feature-flags": patch
---

Make feature flag evaluation resilient to runtime failures

Flag evaluation now returns the fallback value and logs a warning if a lookup throws — for example when a remote-binding dev tunnel drops — rather than failing the request. Detail methods return an `ERROR` reason with the fallback in these cases.
