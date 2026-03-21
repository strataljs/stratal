---
"stratal": patch
---

Enhance Quarry CLI with dynamic command generation, improved help output, and usage generator

### Details

- Replace static `ListCommand` with dynamic command generation via `createDynamicCommands` that auto-registers user-defined commands with Clipanion
- Improve `HelpCommand` to display detailed usage for specific commands including arguments, options, and aliases
- Add `UsageGenerator` for rendering formatted command usage with ANSI colors (name, description, arguments, options sections)
- Add `colors` utility module for ANSI terminal color output
- Add `QuarryRegistry.list()` method to retrieve all registered command entries
- Add comprehensive tests for dynamic commands, help command, and usage generator
