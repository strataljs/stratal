# Quarry CLI

Quarry is Stratal's built-in CLI. It imports your app's default `Stratal` export from `src/index.ts` — no separate entry file needed.

## Running Commands

```bash
npx quarry <command> [arguments] [--options]

# Custom entry path (if not src/index.ts)
npx quarry ./custom/entry.ts <command>
```

## Built-in Commands

| Command | Purpose |
|---------|---------|
| `list` | Show all registered commands |
| `help <command>` | Show usage for a specific command |
| `route:list` | List all registered HTTP routes with methods and paths |
| `route:types {--output=}` | Generate TypeScript types for named routes |
| `event:list` | List all registered event listeners |
| `schedule:list` | List all cron job schedules |
| `queue:list` | List all queue consumers |
| `db:seed {name*} {--all}` | Run a specific seeder/seeders or all seeders |
| `db:seed:list` | List all available seeders |
| `api` | Serve the OpenAPI spec |
| `mcp:serve` | Start an MCP stdio server exposing routes as tools |
| `mcp:tools` | List routes that would be exposed as MCP tools |

## Debugging Your App

Run these commands first to inspect your app state before reading code:

```bash
# Verify routes are registered correctly
npx quarry route:list

# Check event listener wiring
npx quarry event:list

# Inspect cron schedules (must match wrangler.jsonc triggers)
npx quarry schedule:list

# See what queue consumers are registered
npx quarry queue:list

# List all available seeders
npx quarry db:seed:list

# Generate type-safe route names
npx quarry route:types
npx quarry route:types --output=types/routes.d.ts

# Preview what MCP tools your API exposes
npx quarry mcp:tools
```

## MCP Server

Start an MCP stdio server that exposes your OpenAPI routes as tools for AI agents:

```bash
npx quarry mcp:serve
```

**Flags:**

- `--url=<base-url>` — Dispatch requests to an external URL instead of the in-process Hono app
- `--header=<Key:Value>` — Add headers to dispatched requests (repeatable)
- `--tag=<tag>` — Filter routes by OpenAPI tag (repeatable)
- `--path=<prefix>` — Filter routes by path prefix

**How it works:**

- Reads the generated OpenAPI spec from your app
- Converts each route to an MCP tool (name from operationId or auto-generated)
- By default, dispatches tool calls in-process through the Hono app
- With `--url`, dispatches via HTTP to an external endpoint
- Registers the full OpenAPI spec as an MCP resource

```bash
# Expose only routes tagged "Notes"
npx quarry mcp:serve --tag=Notes

# Expose routes under /api/v1 and dispatch to a running server
npx quarry mcp:serve --path=/api/v1 --url=http://localhost:8787
```

## MCP Tools Listing

Preview which routes would be exposed without starting the server:

```bash
npx quarry mcp:tools
npx quarry mcp:tools --tag=Notes --path=/api/v1
```

Outputs a table with method, path, and description for each tool.

## Creating Custom Commands

```typescript
import { Command } from 'stratal/quarry'
import { Transient } from 'stratal/di'

@Transient()
export class GreetCommand extends Command {
  static command = 'greet {name : The name to greet} {--loud}'
  static description = 'Greet someone'

  async handle(): Promise<void> {
    const name = this.string('name')
    const loud = this.boolean('loud')
    this.info(loud ? `HELLO, ${name.toUpperCase()}!` : `Hello, ${name}!`)
  }
}
```

### Signature Syntax

**Command names:**
- `'greet'` — flat: `quarry greet`
- `'task add'` — subcommand: `quarry task add`
- `'task:add'` — namespaced: `quarry task:add`

**Arguments:**
- `{name}` — required
- `{name?}` — optional
- `{name=default}` — with default
- `{name*}` — variadic (array)
- `{name : description}` — with help text

**Options:**
- `{--flag}` — boolean
- `{--name=}` — value
- `{--name=default}` — with default
- `{--name=*}` — array
- `{--A|name}` — with alias
- `{--name= : description}` — with help text

### Input Accessors

```typescript
this.string('name')     // string value
this.boolean('flag')    // boolean value
this.number('count')    // number (coerces strings)
this.array('items')     // array value
this.input<T>('key')    // generic typed
```

### Output Helpers

```typescript
this.info('message')        // Informational
this.success('done!')       // Success
this.warn('careful')        // Warning
this.error('failed')        // Error
this.line('text')           // Plain line
this.newLine()              // Empty line
this.comment('note')        // Comment style
this.table(headers, rows)   // Formatted table
this.fail('msg', 1)         // Error + exit code
```

### Calling Other Commands

```typescript
async handle(): Promise<void> {
  const result = await this.call('other:command', { name: 'value' })
}
```

### Static Properties

```typescript
export class MyCommand extends Command {
  static command = 'my:command {arg} {--opt=}'   // Required
  static description = 'What this command does'   // Optional
  static aliases = ['mc']                         // Optional
}
```

### Registration

Add commands to module `providers` (auto-discovered):

```typescript
@Module({
  providers: [GreetCommand, MigrateCommand],
})
export class AppModule {}
```

Commands execute within request-scoped DI containers with full access to injected services.

For seeders (`db:seed`, `db:seed:list`), see `references/seeders.md`.
