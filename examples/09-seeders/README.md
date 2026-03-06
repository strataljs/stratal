# 09 - Seeders

Database seeding with `@stratal/seeders` and the `stratal-seed` CLI.

## What it demonstrates

- `Seeder` abstract class for defining seed data
- `SeederRunner.run()` to register and execute seeders
- CLI commands: `list`, `run <name>`, `--all`, `--dry-run`
- Dependency injection inside seeders (injecting services)
- Seeder module pattern with feature module imports

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
| `npm run seed list` | List all available seeders |
| `npm run seed run notes` | Run the `notes` seeder |
| `npm run seed run -- --all` | Run all seeders |
| `npm run seed run -- --dry-run` | Preview without executing |

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

- [`src/seeders/index.ts`](src/seeders/index.ts) - CLI entry point for `stratal-seed`
- [`src/seeders/seeders.module.ts`](src/seeders/seeders.module.ts) - Module registering seeder providers
- [`src/seeders/notes.seeder.ts`](src/seeders/notes.seeder.ts) - Seeder that creates sample notes
- [`src/notes/notes.service.ts`](src/notes/notes.service.ts) - In-memory notes service
- [`src/notes/notes.controller.ts`](src/notes/notes.controller.ts) - Notes REST controller
