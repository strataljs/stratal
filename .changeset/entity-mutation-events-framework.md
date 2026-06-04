---
"@stratal/framework": patch
---

Emit entity mutation events with full entity snapshots from the database layer

### Details

- New typed events: `entity.{Model}.created` (`{ after }`), `entity.{Model}.updated` (`{ before, after }`), and `entity.{Model}.deleted` (`{ before }`), plus wildcard subscriptions (`entity.{Model}`, `entity.{verb}`, `entity`).
- Unlike the existing `before.*`/`after.*` events (raw query args/result), entity events carry full entity snapshots, with the pre-mutation snapshot loaded inside the mutation's transaction.
- Listener-driven cost: snapshots are only loaded when a matching subscription exists, so models nobody observes pay nothing. A global `entity` wildcard makes every model pay the pre-read — subscribe per model when cost matters.
