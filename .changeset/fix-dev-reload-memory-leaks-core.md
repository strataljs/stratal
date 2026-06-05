---
"stratal": patch
---

Fix memory leaks that crashed the dev server (OOM) after repeated hot reloads

### Details

- Hot reloads now fully tear down the previous application before the new one boots — old and new dependency graphs no longer coexist, so memory stays flat across reloads
- Instances superseded mid-boot by a newer reload now reject with `StratalSupersededError` instead of hanging forever; in-flight requests during a reload are transparently served by the replacing instance
- `Container.dispose()` is now async and invokes `Symbol.asyncDispose`, `Symbol.dispose`, or `dispose()` on container-created instances, letting services release timers, sockets, and pools on shutdown — `await` it if you call it directly
- i18n message registrations are deduplicated by content, so module re-evaluation on hot reload no longer grows the message store unboundedly
