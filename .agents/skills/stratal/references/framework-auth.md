# Authentication & Auth Context

## Installation

```bash
npm install @stratal/framework
npm install better-auth @better-auth/core    # required peer deps for auth
```

## AuthModule Setup

`AuthModule.withRootAsync()` registers the Better Auth integration:

```typescript
import { AuthModule } from '@stratal/framework/auth'
import { DI_TOKENS, type AsyncModuleOptions } from 'stratal/di'
import { CONFIG_TOKENS } from 'stratal/config'
import { type BetterAuthOptions } from 'better-auth'

@Module({
  imports: [
    AuthModule.withRootAsync({
      inject: [DI_TOKENS.Database, CONFIG_TOKENS.ConfigService],
      useFactory: (db, config) => createAuthOptions(db, config),
    }),
  ],
})
export class AppModule {}
```

**Signature:**

```typescript
static withRootAsync<TOptions extends BetterAuthOptions>(
  options: AsyncModuleOptions<TOptions>
): DynamicModule
```

The module auto-applies two middlewares in order:
1. **AuthContextMiddleware** — creates and registers `AuthContext` in the request container
2. **SessionVerificationMiddleware** — verifies session via Better Auth and populates `AuthContext` with `userId`

## AuthService

Generic service wrapping Better Auth. Decorated with `@Transient(AUTH_SERVICE)`.

```typescript
import { AuthService, AUTH_SERVICE } from '@stratal/framework/auth'
import { Transient } from 'stratal/di'

@Transient(AUTH_SERVICE)
export class AppAuthService extends AuthService<MyAuthOptions> {
  async signInMagicLink(email: string) {
    return wrapBetterAuth(async () => {
      return this.auth.api.signInMagicLink({
        body: { email },
        headers: new Headers(),
      })
    })
  }
}
```

### Class Declaration

```typescript
@Transient(AUTH_SERVICE)
export class AuthService<TOptions extends BetterAuthOptions = BetterAuthOptions> {
  constructor(@inject(AUTH_OPTIONS) protected readonly options: TOptions)

  get auth(): Auth<TOptions>
}
```

- **`auth`** — getter returning the Better Auth instance for direct API access
- Extend and re-decorate with `@Transient(AUTH_SERVICE)` to add custom methods

## AuthContext (Request-Scoped)

Registered per-request by `AuthContextMiddleware`. Inject via `DI_TOKENS.AuthContext`.

```typescript
import { AuthContext, type AuthInfo } from '@stratal/framework/context'
import { DI_TOKENS, inject } from 'stratal/di'

@Transient()
export class ProfileService {
  constructor(@inject(DI_TOKENS.AuthContext) private readonly authContext: AuthContext) {}

  getProfile() {
    const userId = this.authContext.requireUserId() // throws if not authenticated
    return this.findUser(userId)
  }
}
```

### AuthInfo Interface

```typescript
interface AuthInfo {
  userId?: string
}
```

### API

| Method | Signature | Description |
|--------|-----------|-------------|
| `setAuthContext` | `(info: AuthInfo) => void` | Sets auth context (called by middleware) |
| `getUserId` | `() => string \| undefined` | Returns userId or undefined |
| `requireUserId` | `() => string` | Returns userId or throws `UserNotAuthenticatedError` |
| `isAuthenticated` | `() => boolean` | Checks if user is authenticated |
| `getAuthContext` | `() => AuthInfo` | Returns full context or throws `ContextNotInitializedError` |
| `clearAuthContext` | `() => void` | Clears auth context |

## Middleware

### AuthContextMiddleware

```typescript
@Transient()
export class AuthContextMiddleware implements Middleware {
  async handle(ctx: RouterContext, next: () => Promise<void>): Promise<void> {
    const requestContainer = ctx.getContainer()
    const authContext = new AuthContext()
    requestContainer.registerValue(DI_TOKENS.AuthContext, authContext)
    await next()
  }
}
```

### SessionVerificationMiddleware

```typescript
@Transient()
export class SessionVerificationMiddleware implements Middleware {
  constructor(@inject(AUTH_SERVICE) private readonly authService: AuthService) {}

  async handle(ctx: RouterContext, next: () => Promise<void>): Promise<void> {
    const session = await this.authService.auth.api.getSession({
      headers: ctx.c.req.raw.headers,
    })

    if (session) {
      const authContext = ctx.getContainer().resolve<AuthContext>(DI_TOKENS.AuthContext)
      authContext.setAuthContext({ userId: session.user.id })
    }

    await next()
  }
}
```

- Never throws — allows request to continue regardless of session status
- Only populates context if session is valid

## Auth Errors

### Better Auth Mapped Errors

| Error Class | Code | i18n Key |
|-------------|------|----------|
| `InvalidCredentialsError` | 3000 (`AUTH.INVALID_CREDENTIALS`) | `errors.auth.invalidCredentials` |
| `InvalidPasswordError` | 3000 (`AUTH.INVALID_CREDENTIALS`) | `errors.auth.invalidPassword` |
| `SessionExpiredError` | 3001 (`AUTH.SESSION_EXPIRED`) | `errors.auth.sessionExpired` |
| `EmailNotVerifiedError` | 3007 (`AUTH.EMAIL_NOT_VERIFIED`) | `errors.auth.emailNotVerified` |
| `PasswordTooShortError` | 3008 (`AUTH.PASSWORD_TOO_SHORT`) | `errors.auth.passwordTooShort` |
| `PasswordTooLongError` | 3009 (`AUTH.PASSWORD_TOO_LONG`) | `errors.auth.passwordTooLong` |
| `AccountAlreadyExistsError` | 3010 (`AUTH.ACCOUNT_ALREADY_EXISTS`) | `errors.auth.accountAlreadyExists` |
| `FailedToCreateUserError` | 3011 (`AUTH.FAILED_TO_CREATE_USER`) | `errors.auth.failedToCreateUser` |
| `FailedToCreateSessionError` | 3012 (`AUTH.FAILED_TO_CREATE_SESSION`) | `errors.auth.failedToCreateSession` |
| `FailedToUpdateUserError` | 3013 (`AUTH.FAILED_TO_UPDATE_USER`) | `errors.auth.failedToUpdateUser` |
| `SocialAccountLinkedError` | 3014 (`AUTH.SOCIAL_ACCOUNT_LINKED`) | `errors.auth.socialAccountLinked` |
| `CannotUnlinkLastAccountError` | 3015 (`AUTH.CANNOT_UNLINK_LAST_ACCOUNT`) | `errors.auth.cannotUnlinkLastAccount` |

### Token/Verification Errors

| Error Class | Code | i18n Key |
|-------------|------|----------|
| `InvalidTokenError` | 3003 (`AUTH.INVALID_TOKEN`) | `errors.auth.invalidToken` |
| `TokenRequiredError` | 1001 (`VALIDATION.REQUIRED_FIELD`) | `errors.auth.tokenRequired` |
| `VerificationFailedError` | 3000 (`AUTH.INVALID_CREDENTIALS`) | `errors.auth.verificationFailed` |

### Context Errors

| Error Class | Code | Import |
|-------------|------|--------|
| `ContextNotInitializedError` | 3004 (`AUTH.CONTEXT_NOT_INITIALIZED`) | `@stratal/framework/context` |
| `UserNotAuthenticatedError` | 3005 (`AUTH.USER_NOT_AUTHENTICATED`) | `@stratal/framework/context` |
| `UserNotAuthorizedError` | 3100 (`AUTHZ.FORBIDDEN`) | `@stratal/framework/context` |

## Utility Functions

### wrapBetterAuth()

Wraps Better Auth API calls with error mapping:

```typescript
import { wrapBetterAuth } from '@stratal/framework/auth'

const result = await wrapBetterAuth(async () => {
  return this.auth.api.signInMagicLink({ body: { email }, headers: new Headers() })
})
```

### getErrorHandlerConfig()

Returns Better Auth `onAPIError` config for automatic error mapping:

```typescript
import { getErrorHandlerConfig } from '@stratal/framework/auth'
```

## Tokens

```typescript
// @stratal/framework/auth
export const AUTH_SERVICE = Symbol.for('Core.AuthService')
export const AUTH_OPTIONS = Symbol.for('Core.AuthOptions')

// stratal/di (DI_TOKENS)
DI_TOKENS.AuthContext = Symbol.for('AuthContext')
```

## Import Paths

```typescript
// Auth module, service, middleware, errors, utils
import { AuthModule, AuthService, AUTH_SERVICE, AUTH_OPTIONS } from '@stratal/framework/auth'
import { wrapBetterAuth, getErrorHandlerConfig } from '@stratal/framework/auth'
import { AuthContextMiddleware, SessionVerificationMiddleware } from '@stratal/framework/auth'
import { InvalidCredentialsError, SessionExpiredError, ... } from '@stratal/framework/auth'

// Context and context errors
import { AuthContext, type AuthInfo } from '@stratal/framework/context'
import { UserNotAuthenticatedError, ContextNotInitializedError, UserNotAuthorizedError } from '@stratal/framework/context'
```
