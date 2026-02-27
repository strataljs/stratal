import type { Context } from 'hono'
import type { OpenAPIHono } from '../../i18n/validation'
import { inject } from 'tsyringe'
import { Container, CONTAINER_TOKEN } from '../../di'
import { Transient } from '../../di/decorators'
import { ROUTER_CONTEXT_KEYS } from '../constants'
import { RouterContext } from '../router-context'
import type { RouterEnv } from '../types'

/**
 * Request Scope Service
 *
 * Manages request-scoped container setup and lifecycle.
 * Creates context-enriched instances of `@RequestScoped` services.
 *
 * **Two-Tier Container Architecture:**
 * ```
 * Container (manages global container)
 *        ↓
 *   container.createRequestScope(routerContext)
 *        ↓
 * Request Container (child, per request)
 *        ↓
 *   Context-enriched instances via withContext(routerContext)
 * ```
 *
 * **Responsibilities:**
 * - Setup request-scoped container middleware
 * - Create context-enriched instances of `@RequestScoped` services
 *
 * **Note:**
 * - AuthContext registration is handled by AuthModule's AuthContextMiddleware
 * - Locale extraction is handled by I18nModule's LocaleExtractionMiddleware
 * - Zod i18n context is handled by I18nModule's I18nContextMiddleware
 * - Session verification is handled by AuthModule's SessionVerificationMiddleware
 */
@Transient()
export class RequestScopeService {
  constructor(
    @inject(CONTAINER_TOKEN)
    private readonly container: Container
  ) {}

  /**
   * Setup request-scoped container middleware
   *
   * This MUST run before all other middleware and routes.
   * Creates a child container with context-enriched service instances.
   */
  setupMiddleware(app: OpenAPIHono<RouterEnv>): void {
    app.use('*', async (c, next) => {
      // Create RouterContext
      const routerContext = new RouterContext(c as Context<RouterEnv>)

      // Create request scope using Container
      const requestContainer = this.container.createRequestScope(routerContext)

      // Store in Hono context
      c.set(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER, requestContainer)

      // Run request within AsyncLocalStorage context
      // Cleanup is automatic in runWithContextStore
      await requestContainer.runWithContextStore(() => next())
    })
  }
}
