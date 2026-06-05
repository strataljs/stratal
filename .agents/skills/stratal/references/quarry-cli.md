# Quarry CLI

Quarry is Stratal's built-in CLI. It imports your app's default `Stratal` export from `src/quarry.ts`.

## Running Commands

```bash
npx quarry <command> [arguments] [--options]

# Custom entry path (if not src/quarry.ts)
npx quarry ./custom/entry.ts <command>
```

### CLI Entry File

Create `src/quarry.ts` using `QuarryRunner`:

```typescript
import { QuarryRunner } from 'stratal/quarry/runner'
import { AppModule } from './app.module'

export default QuarryRunner.run({
  imports: [AppModule],
  providers: [/* seeders */],
})
```

For Inertia apps, add `InertiaQuarryModule`:

```typescript
import { QuarryRunner } from 'stratal/quarry/runner'
import { InertiaQuarryModule } from '@stratal/inertia/quarry'
import { AppModule } from './app.module'

export default QuarryRunner.run({
  imports: [AppModule, InertiaQuarryModule],
})
```

## Wrangler Environment

Use `--env <name>` / `-e <name>` to target a `wrangler.jsonc` environment (`env.staging`, `env.production`, …). Loads that environment's bindings and vars.

```bash
npx quarry --env staging route:list
npx quarry -e staging db:seed
npx quarry --env=production route:list
npx quarry ./custom/entry.ts --env staging route:list
```

- Reserved at the CLI level — commands cannot define their own `--env` option.
- Position-tolerant: works before or after the entry path.
- Omit the flag to use the top-level (default) wrangler config.
- Unknown env name: wrangler prints the available keys and exits.

## Built-in Commands

| Command | Purpose |
|---------|---------|
| `list` | Show all registered commands |
| `help <command>` | Show usage for a specific command |
| `route:list {--method=} {--path=} {--name=} {--hidden}` | List all registered HTTP routes (supports filtering) |
| `route:types {--output=}` | Generate TypeScript types for named routes |
| `event:list` | List all registered event listeners |
| `schedule:list` | List all cron job schedules |
| `queue:list` | List all queue consumers |
| `queue:failed {--queue=} {--limit=}` | List failed queue jobs |
| `queue:retry {id?} {--all} {--queue=}` | Retry failed queue jobs |
| `queue:purge {id?} {--all} {--queue=}` | Delete failed queue jobs without retrying |
| `db:seed {name*} {--all}` | Run a specific seeder/seeders or all seeders |
| `db:seed:list` | List all available seeders |
| `api` | Serve the OpenAPI spec |
| `mcp:serve` | Start an MCP stdio server exposing routes as tools |
| `mcp:tools` | List routes that would be exposed as MCP tools |
| `i18n:check {--locale=} {--prefix=}` | Audit translations: missing/extra keys vs `en`. Exit code 1 on issues (CI-friendly) |
| `i18n:stats {--prefix=}` | Show translation coverage statistics per locale |
| `i18n:list {--locale=} {--prefix=} {--values}` | List all message keys with Y/N coverage per locale |
| `i18n:search {query} {--locale=} {--keys-only}` | Search message keys or values by substring |
| `i18n:namespaces {--depth=} {--locale=}` | List namespaces with key counts per locale |
| `i18n:duplicates {--locale=} {--prefix=}` | Find keys sharing identical translation values |

## Debugging Your App

Run these commands first to inspect your app state before reading code:

```bash
# Verify routes are registered correctly
npx quarry route:list

# Filter routes
npx quarry route:list --method=GET       # Only GET routes
npx quarry route:list --path=/api/v1     # Routes containing path substring
npx quarry route:list --name=users       # Routes with name containing 'users'
npx quarry route:list --hidden           # Include routes hidden from OpenAPI docs

# Check event listener wiring
npx quarry event:list

# Inspect cron schedules (must match wrangler.jsonc triggers)
npx quarry schedule:list

# See what queue consumers are registered
npx quarry queue:list

# List failed queue jobs
npx quarry queue:failed
npx quarry queue:failed --queue=NOTIFICATIONS_QUEUE

# Retry all failed jobs
npx quarry queue:retry --all

# Purge all failed jobs
npx quarry queue:purge --all

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

## I18n Introspection

Inspect translation coverage, find missing keys, and audit locales. Base locale is always `en`.

```bash
# Audit all non-en locales for missing/extra keys (returns exit code 1 if issues found)
npx quarry i18n:check

# Check only French translations
npx quarry i18n:check --locale=fr

# Check only the 'common' namespace
npx quarry i18n:check --prefix=common

# Coverage dashboard: keys, translated, missing, extra, % per locale
npx quarry i18n:stats

# List all keys with Y/N per locale
npx quarry i18n:list

# Show translated values for a specific locale
npx quarry i18n:list --locale=fr --values

# Search for keys or values matching a substring
npx quarry i18n:search email
npx quarry i18n:search obligatoire --locale=fr

# Only search key names (skip value matching)
npx quarry i18n:search validation --keys-only

# Show namespaces with key counts
npx quarry i18n:namespaces

# Drill into sub-namespaces
npx quarry i18n:namespaces --depth=2

# Find duplicate values (copy-paste detection)
npx quarry i18n:duplicates
npx quarry i18n:duplicates --locale=fr
```

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
