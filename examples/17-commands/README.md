# Example 17 — Commands (Quarry CLI)

A **Task Manager CLI** built with Stratal's Quarry command system. Demonstrates CLI commands with argument parsing, DI injection, and Cloudflare KV persistence.

## Features Demonstrated

| Feature | Command | Details |
|---|---|---|
| Required argument | `task:add` | `{title : The task title}` |
| Optional argument | `task:show` | `{id?}` |
| Default value | `task:show` | `{format=short}` |
| Array/variadic | `task:tag` | `{tags*}` |
| Boolean flag + alias | `task:complete` | `{--f\|force}` |
| Value option + alias | `task:complete`, `task:list` | `{--n\|note=}`, `{--s\|status=}` |
| Command aliases | `task:complete` | `static aliases = ['task:done']` |
| Table output | `task:list` | `this.table(headers, rows)` |
| Command calling | `task:reset` | `this.call('task:list')` |
| DI injection | All commands | `@inject(TaskService)` |

## Setup

```bash
npm install
```

## Usage

```bash
# Add tasks
npx quarry task:add "Buy groceries"
npx quarry task:add "Write tests" --priority=high

# List tasks
npx quarry task:list
npx quarry task:list --status=pending

# Complete a task
npx quarry task:complete 1 --force --note="All done"
npx quarry task:done 1 -f   # alias

# Tag a task
npx quarry task:tag 2 urgent important

# Show task details
npx quarry task:show 2
npx quarry task:show 2 detailed

# Reset all tasks
npx quarry task:reset --force

# Built-in commands
npx quarry list              # List all commands
npx quarry help task:add     # Show usage for a command
```
