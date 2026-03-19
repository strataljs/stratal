---
"stratal": patch
---

Add Quarry command framework with auto-discovery, signature parsing, and CLI integration

### Details

- Introduce `Command` base class with declarative signature parsing (arguments, options, flags)
- Add `Quarry` class for command registration, discovery from modules, and execution
- Add `QuarryRunner` for CLI integration with `@swc-node/register` TypeScript support
- Add `quarry` CLI bin entry point (`npx quarry`)
- Auto-discover commands from module `providers` via `isCommand()` utility
- Support usage/help generation with `UsageGenerator`
- Custom error types: `CommandError`, `CommandNotFoundError`, `CommandExecutionError`
- New DI token `QUARRY_COMMANDS` for manual command registration
- New sub-path export `stratal/quarry`
