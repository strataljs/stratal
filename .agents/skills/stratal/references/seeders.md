# Seeders

For CLI command creation and all quarry commands, see `references/quarry-cli.md`.

## Creating a Seeder

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

## Calling Other Seeders

```typescript
@Transient()
export class DatabaseSeeder extends Seeder {
  async run(): Promise<void> {
    await this.call(UsersSeeder)   // Runs UsersSeeder first
    await this.call(NotesSeeder)   // Then NotesSeeder
  }
}
```

## Registration

Add seeders to module `providers` (auto-discovered from any class extending `Seeder`):

```typescript
@Module({
  providers: [NotesSeeder, DatabaseSeeder, UsersSeeder],
})
export class AppModule {}
```

## Running Seeders

```bash
# Run a specific seeder
npx quarry db:seed NotesSeeder

# Run all seeders
npx quarry db:seed --all

# List available seeders
npx quarry db:seed:list
```

Seeders execute within request-scoped DI containers with full access to injected services.
