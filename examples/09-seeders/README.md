# 09 - Seeders

Database seeding with `stratal/seeder` and the Quarry CLI framework.

## What it demonstrates

- `Seeder` abstract class for defining seed data
- `QuarryRunner.run()` to bootstrap the CLI
- Built-in commands: `db:seed`, `db:seed:list`
- Dependency injection inside seeders (injecting services)
- Seeders as module providers (auto-discovered)

## Running

```bash
cd examples/09-seeders
npm install
```

### Start the worker

```bash
npx wrangler dev
```

### CLI commands

| Command | Description |
|---------|-------------|
| `npm run quarry db:seed:list` | List all available seeders |
| `npm run quarry db:seed NotesSeeder` | Run the `NotesSeeder` seeder |
| `npm run quarry db:seed -- --all` | Run all seeders |
| `npm run quarry db:seed NotesSeeder -- --dry-run` | Preview without executing |

### Example requests

```bash
# List all notes (includes seeded data after running seeders)
curl http://localhost:8787/api/notes

# Create a note
curl -X POST http://localhost:8787/api/notes \
  -H 'Content-Type: application/json' \
  -d '{"title": "My Note", "content": "Hello from Stratal"}'
```

## Key files

- [`src/commands/index.ts`](src/commands/index.ts) - CLI entry point using `QuarryRunner`
- [`src/seeders/notes.seeder.ts`](src/seeders/notes.seeder.ts) - Seeder that creates sample notes
- [`src/app.module.ts`](src/app.module.ts) - Root module with seeder in providers
- [`src/notes/notes.service.ts`](src/notes/notes.service.ts) - In-memory notes service
- [`src/notes/notes.controller.ts`](src/notes/notes.controller.ts) - Notes REST controller
