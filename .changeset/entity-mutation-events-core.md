---
"stratal": patch
---

Add `hasListeners()` to the event registry for checking whether any handler matches an event

Uses the same pattern matching as `emit()` (exact, model wildcard, operation wildcard, phase wildcard), letting emitters skip expensive payload construction when nobody is listening.
