# Seeders & CLI Commands

## Seeders

### Creating a Seeder

```typescript
import { Seeder } from 'stratal/seeder'
import { Transient, inject } from 'stratal/di'

@Transient()
export class NotesSeeder extends Seeder {
  constructor(
    @inject(NOTES_TOKENS.NotesService) private notesService: NotesService,
  ) {
    super()
  }

  async run(): Promise<void> {
    await this.notesService.create({ title: 'First Note', content: 'Hello!' })
    await this.notesService.create({ title: 'Second Note', content: 'World!' })
  }
}
```

### Calling Other Seeders

```typescript
@Transient()
export class DatabaseSeeder extends Seeder {
  async run(): Promise<void> {
    await this.call(UsersSeeder)   // Runs UsersSeeder first
    await this.call(NotesSeeder)   // Then NotesSeeder
  }
}
```

### Registration

Add seeders to module `providers`:

```typescript
@Module({
  providers: [NotesSeeder, DatabaseSeeder, UsersSeeder],
})
export class AppModule {}
```

Seeders are auto-discovered from providers (any class extending `Seeder`).

### Running Seeders

```bash
# Run a specific seeder
npx quarry db:seed NotesSeeder

# Run all seeders
npx quarry db:seed --all

# List available seeders
npx quarry db:seed:list
```

Seeders execute within request-scoped DI containers with full access to injected services.

## Quarry CLI Commands

### Creating a Command

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
- `'greet'` — flat command: `quarry greet`
- `'task add'` — subcommand: `quarry task add`
- `'task:add'` — namespaced: `quarry task:add`

**Arguments:**
- `{name}` — required
- `{name?}` — optional
- `{name=default}` — with default value
- `{name*}` — variadic (array)
- `{name : description}` — with description

**Options:**
- `{--flag}` — boolean flag
- `{--name=}` — accepts a value
- `{--name=default}` — with default value
- `{--name=*}` — array option
- `{--A|name}` — with single-char alias
- `{--name= : description}` — with description

### Input Accessors

```typescript
this.string('name')     // Get string input
this.boolean('flag')    // Get boolean input
this.number('count')    // Get number input (coerces strings)
this.array('items')     // Get array input
this.input<T>('key')    // Get generic typed input
```

### Output Helpers

```typescript
this.info('message')     // Informational message
this.success('done!')    // Success message
this.warn('careful')     // Warning: careful
this.error('failed')     // Error message
this.line('text')        // Plain line
this.newLine()           // Empty line
this.comment('note')     // // note
this.table(headers, rows) // Formatted table
this.fail('msg', 1)      // Error + set exit code
```

### Calling Other Commands

```typescript
async handle(): Promise<void> {
  const result = await this.call('other:command', { name: 'value' })
}
```

### Registration

Add commands to module `providers`:

```typescript
@Module({
  providers: [GreetCommand, MigrateCommand],
})
export class AppModule {}
```

Commands are auto-discovered from providers via `isCommand()` utility.

### Running Commands

```bash
# Default entry point: imports src/index.ts default export
npx quarry greet "World" --loud

# Custom entry path
npx quarry ./custom/entry.ts greet "World"

# Built-in commands
npx quarry list              # List all commands
npx quarry help greet        # Show help for a command
```

### Static Properties

```typescript
export class MyCommand extends Command {
  static command = 'my:command {arg} {--opt=}'    // Required
  static description = 'What this command does'    // Optional
  static aliases = ['mc']                          // Optional alternative names
}
```

### CLI Entry Point

`npx quarry` imports the app's default `Stratal` export from `src/index.ts`. No separate entry file needed.

Commands execute within request-scoped DI containers.
