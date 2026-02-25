# 01 - Hello World

The simplest possible Stratal application: one module, one controller, one GET endpoint.

## What it demonstrates

- `StratalWorker` entry point
- `@Module()` decorator to declare controllers
- `@Controller()` to define a route prefix
- `@Route()` with a Zod response schema
- `IController.index()` auto-mapped to `GET /api/hello`

## Running

```bash
cd examples/01-hello-world
npx wrangler dev
```

Then visit [http://localhost:8787/api/hello](http://localhost:8787/api/hello) to see:

```json
{ "message": "Hello World" }
```

## Key files

- [`src/index.ts`](src/index.ts) - Worker entry point
- [`src/app.module.ts`](src/app.module.ts) - Root module
- [`src/hello.controller.ts`](src/hello.controller.ts) - Hello controller
