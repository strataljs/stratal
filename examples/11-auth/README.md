# 11 - Auth

Session-based authentication with Better Auth and `@stratal/framework`.

## What it demonstrates

- `AuthModule.withRootAsync({ inject, useFactory })` for configuring Better Auth
- `AuthContext` injection via `DI_TOKENS.AuthContext` — `getUserId()`, `isAuthenticated()`, `requireUserId()`
- `AuthGuard()` factory for protecting routes (returns 401 if unauthenticated)
- Module augmentation for `StratalEnv` with `DB` and `BETTER_AUTH_SECRET`
- Better Auth endpoints automatically mounted (sign up, sign in, session)
- D1 database binding for Cloudflare Workers-native storage
- Public vs protected endpoint pattern

## Prerequisites

Create a D1 database for local development:

```bash
cd examples/11-auth
npx wrangler d1 create auth-example
```

Update `wrangler.jsonc` with the returned `database_id`, then apply the migrations:

```bash
npx wrangler d1 migrations apply auth-example --local
```

## Running

```bash
cd examples/11-auth
npm install
npx wrangler dev
```

## API endpoints

| Method | Path              | Description                          |
|--------|-------------------|--------------------------------------|
| *      | /api/auth/*       | Better Auth endpoints (sign-up, sign-in, sign-out, get-session) |
| GET    | /api/profile      | Get current user (requires auth)     |
| GET    | /api/public       | Public endpoint (no auth)            |

## Example requests

```bash
# Access public endpoint (no auth needed)
curl http://localhost:8787/api/public

# Sign up a new user
curl -X POST http://localhost:8787/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"name": "John Doe", "email": "john@example.com", "password": "password123"}'

# Sign in and capture the session cookie
curl -X POST http://localhost:8787/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email": "john@example.com", "password": "password123"}' \
  -c cookies.txt

# Access protected profile endpoint
curl http://localhost:8787/api/profile -b cookies.txt

# Without auth — returns 401
curl http://localhost:8787/api/profile
```

## Key files

- [`src/index.ts`](src/index.ts) - `StratalEnv` augmentation with `DB` and `BETTER_AUTH_SECRET`
- [`src/auth/auth.config.ts`](src/auth/auth.config.ts) - Better Auth options factory
- [`src/auth/auth.controller.ts`](src/auth/auth.controller.ts) - AuthController proxying requests to Better Auth handler
- [`src/auth/auth.module.ts`](src/auth/auth.module.ts) - AuthModule registering the controller
- [`src/app.module.ts`](src/app.module.ts) - `AuthModule.withRootAsync()` configuration
- [`src/profile/profile.controller.ts`](src/profile/profile.controller.ts) - Protected route using `AuthGuard()` and `AuthContext`
- [`src/public/public.controller.ts`](src/public/public.controller.ts) - Unprotected route
