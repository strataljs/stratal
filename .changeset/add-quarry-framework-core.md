---
"stratal": patch
---

Introduce Quarry command framework with auto-discovery and Clipanion-based CLI

### Details

- Add `Command` base class with declarative signature parsing (arguments, options, flags)
- Add `QuarryRegistry` for command registration, discovery from modules, and execution
- Add `quarry` CLI bin (`npx quarry`) with Clipanion-based command routing
- Add virtual `cloudflare:workers` ESM loader hook for Node compatibility
- Built-in commands: `list`, `help <command>`, and dynamic command dispatch
- Auto-discover commands from module `providers` via `isCommand()` utility
- Support usage/help generation with `UsageGenerator`
- Custom error types: `CommandError`, `CommandNotFoundError`, `CommandExecutionError`
- New DI token `QUARRY_COMMANDS` for manual command registration
- New sub-path export `stratal/quarry`
- New dependencies: `clipanion`, `@swc-node/register`
