---
"stratal": patch
---

Preserve forward slashes when encoding catch-all path parameters

URL generation previously percent-encoded `/` inside path-param values, so a value like `'auth/login'` for a catch-all route (`:slug{.+}`) became `'auth%2Flogin'`. Each segment is now encoded individually, so slash-containing values round-trip cleanly while single segments still behave like `encodeURIComponent`.
