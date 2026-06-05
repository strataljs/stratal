---
"@stratal/inertia": patch
---

Fix flash cookie encoding crashing on non-Latin1 characters

### Details

- Flash cookies are now encoded with UTF-8-safe base64 — `btoa` alone threw on any character outside Latin1 (em-dashes, smart quotes, non-Latin scripts), which are routine in user-facing flash messages
