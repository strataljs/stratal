# @stratal/seeders

## 0.0.13

### Patch Changes

- Updated dependencies [[`8d0df50`](https://github.com/strataljs/stratal/commit/8d0df506411bc725ef4e4eaf4efdb314b3384d98), [`527f675`](https://github.com/strataljs/stratal/commit/527f675ea3b4cdb98165cbe1f81e820fa9e79490), [`bb99119`](https://github.com/strataljs/stratal/commit/bb991196dbcc55963d16ee1a6f5db580c18c796a), [`957de6e`](https://github.com/strataljs/stratal/commit/957de6e88684344bf26e95d03187345bf77f4f52), [`0ade941`](https://github.com/strataljs/stratal/commit/0ade94162f9058e9230039fa72efbbf3e57cf572)]:
  - stratal@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies [[`11b0da9`](https://github.com/strataljs/stratal/commit/11b0da97ef436bffef592fbc34685bbcc85d7ef7), [`e1a2ba2`](https://github.com/strataljs/stratal/commit/e1a2ba2da883481d192a15b8015456705982d683), [`d58b878`](https://github.com/strataljs/stratal/commit/d58b8782848562a50b79cd558eaf01978aa77f26)]:
  - stratal@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies [[`bae01ef`](https://github.com/strataljs/stratal/commit/bae01eff7cb7f520ad00206377d9f5f4968076b6)]:
  - stratal@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies [[`3329d20`](https://github.com/strataljs/stratal/commit/3329d20658ea6a6f7cadbbb3efb7630b1cca9ad2)]:
  - stratal@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies [[`c0d9313`](https://github.com/strataljs/stratal/commit/c0d9313b30272eece8a4596718b7d4c1b442c221)]:
  - stratal@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies []:
  - stratal@0.0.8

## 0.0.7

### Patch Changes

- [#81](https://github.com/strataljs/stratal/pull/81) [`89e06b5`](https://github.com/strataljs/stratal/commit/89e06b57f8aca553f60cbefab8f931cf5554f1b3) Thanks [@adesege](https://github.com/adesege)! - Rearchitect core internals: replace AsyncLocalStorage-based request context with explicit container passing, and replace RouterService with HonoApp

  ### Breaking Changes

  **`stratal` (core)**

  - **Removed `RequestContextStore`** — The `AsyncLocalStorage`-based request context propagation is eliminated. This removes the dependency on the `nodejs_als` compatibility flag in Cloudflare Workers.
  - **Removed `RouterService` and `RequestScopeService`** — Replaced by `HonoApp`, a subclass of `OpenAPIHono` that directly integrates request scoping, middleware class support, and global error handling.
  - **Removed `RouterAlreadyConfiguredError` and `RouterNotConfiguredError`** — Replaced by `HonoAppAlreadyConfiguredError`.
  - **`Container` no longer accepts `env` or `ctx` in options** — These are now registered as values in the container by `Application` directly.
  - **`runInRequestScope()` callback signature changed** — The callback now receives `(requestContainer: Container) => T | Promise<T>` instead of `() => T | Promise<T>`. Callers must use the passed container for resolution.
  - **`Stratal` initialization changed from lazy to eager** — `Stratal` now eagerly bootstraps by dynamically importing `cloudflare:workers` for `env` and `waitUntil`, instead of lazily initializing on first request.
  - **`queue()` and `scheduled()` no longer accept `env` and `ctx` parameters** — These are obtained from `cloudflare:workers` during eager init.
  - **New `StratalExecutionContext` interface** — A minimal abstraction over Cloudflare's `ExecutionContext` with only `waitUntil()`.
  - **New `HonoApp` class** — Extends `OpenAPIHono` with Stratal concerns; supports `Constructor<Middleware>` in `use()` via module augmentation.

  **`@stratal/framework`**

  - **`DatabaseConnectionConfig.dialect` changed from `Dialect` to `() => Dialect`** — Database connections now take a factory function for lazy dialect/pool creation.
  - **Caching strategy changed from `instancePerContainerCachingFactory` to `instanceCachingFactory`**.

  **`@stratal/testing`**

  - **`TestingModule.runInRequestScope()` callback now receives a `container` parameter** — Update all callbacks to use the passed container for service resolution.
  - **`TestingModule.fetch()` now routes through `HonoApp`** instead of `RouterService`.
  - **`TestingModuleBuilder.compile()` now applies overrides before `initialize()`** — Fixes issue where overrides were applied after initialization.

  ### Minor Changes

  **`@stratal/seeders`**

  - Updated `executeSeeder()` to use the explicit `requestContainer` parameter from `runInRequestScope()`.

- Updated dependencies [[`89e06b5`](https://github.com/strataljs/stratal/commit/89e06b57f8aca553f60cbefab8f931cf5554f1b3), [`bcb3556`](https://github.com/strataljs/stratal/commit/bcb3556a6e1f185e088286f202c605c73799e63f)]:
  - stratal@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies [[`6542f78`](https://github.com/strataljs/stratal/commit/6542f78fda2bf851df7ee5d88d6f7c7d04ea6388)]:
  - stratal@0.0.6

## 0.0.5

### Patch Changes

- [#66](https://github.com/strataljs/stratal/pull/66) [`c8ea964`](https://github.com/strataljs/stratal/commit/c8ea964e272b09ebc6619843e77d2b51178f9423) Thanks [@adesege](https://github.com/adesege)! - Add SeederRunner CLI with `run` and `list` commands, Seeder abstract base class, auto-discovery of seeders from module tree, and request-scoped DI container execution. Supports `--dry-run` and `--all` flags.

- Updated dependencies [[`c8ea964`](https://github.com/strataljs/stratal/commit/c8ea964e272b09ebc6619843e77d2b51178f9423)]:
  - stratal@0.0.5
