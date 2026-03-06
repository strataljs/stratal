import 'reflect-metadata'

import { Application, type ApplicationConfig } from './application'
import type { StratalEnv } from './env'
import { ROUTER_TOKENS, type RouterService } from './router'

/**
 * Stratal — Hono-style entry point for Cloudflare Workers.
 *
 * Lazily initializes the Application on the first handler call and caches it
 * for all subsequent invocations. A concurrent-init guard prevents double
 * initialization from simultaneous requests.
 *
 * @example
 * ```typescript
 * import { Stratal } from 'stratal'
 * import { AppModule } from './app.module'
 *
 * export default new Stratal({ module: AppModule })
 * ```
 */
export class Stratal<Env extends StratalEnv = StratalEnv> {
  private app: Application | null = null
  private initPromise: Promise<Application> | null = null

  constructor(private readonly config: ApplicationConfig) {
    this.fetch = this.fetch.bind(this)
    this.queue = this.queue.bind(this)
    this.scheduled = this.scheduled.bind(this)
  }

  /**
   * Handle HTTP requests via RouterService.
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const app = await this.getApplication(env, ctx)
    const router = app.resolve<RouterService>(ROUTER_TOKENS.RouterService)
    return router.fetch(request, env, ctx)
  }

  /**
   * Handle queue batches.
   */
  async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext): Promise<void> {
    const app = await this.getApplication(env, ctx)
    return app.handleQueue(batch, batch.queue)
  }

  /**
   * Handle scheduled cron triggers.
   */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const app = await this.getApplication(env, ctx)
    return app.handleScheduled(controller)
  }

  /**
   * Get or lazily initialize the Application singleton.
   * The first call's `env`/`ctx` are used for initialization;
   * subsequent calls return the cached instance.
   */
  async getApplication(env: Env, ctx: ExecutionContext): Promise<Application> {
    // Fast path: already initialized
    if (this.app) {
      return this.app
    }

    // Concurrent initialization guard
    if (this.initPromise) {
      return this.initPromise
    }

    // Start initialization
    this.initPromise = this.initializeApp(env, ctx)

    try {
      this.app = await this.initPromise
      return this.app
    } finally {
      this.initPromise = null
    }
  }

  /**
   * Shut down the application and release all resources.
   */
  async shutdown(): Promise<void> {
    if (this.app) {
      await this.app.shutdown()
      this.app = null
    }
  }

  private async initializeApp(env: Env, ctx: ExecutionContext): Promise<Application> {
    const app = new Application({ ...this.config, env, ctx })
    await app.initialize()
    return app
  }
}
