import 'reflect-metadata'

import { Application, type ApplicationConfig } from './application'
import type { StratalEnv } from './env'
import type { HonoApp } from './router/hono-app'

/**
 * Stratal — Hono-style entry point for Cloudflare Workers.
 *
 * Eagerly bootstraps the Application at construction time, dynamically
 * importing `cloudflare:workers` for env and waitUntil.
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
  private initPromise: Promise<Application>

  constructor(config: ApplicationConfig) {
    this.fetch = this.fetch.bind(this)
    this.queue = this.queue.bind(this)
    this.scheduled = this.scheduled.bind(this)

    this.initPromise = this.prepareApp(config)
  }

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const app = await this.ensureReady()
    return app.hono.fetch(request, env, ctx)
  }

  async queue(batch: MessageBatch): Promise<void> {
    const app = await this.ensureReady()
    return app.handleQueue(batch, batch.queue)
  }

  async scheduled(controller: ScheduledController): Promise<void> {
    const app = await this.ensureReady()
    return app.handleScheduled(controller)
  }

  get hono(): Promise<HonoApp> {
    return this.initPromise.then(app => app.hono)
  }

  async shutdown(): Promise<void> {
    try { this.app = await this.initPromise } catch { /* ignore */ }
    if (this.app) {
      await this.app.shutdown()
      this.app = null
    }
  }

  private async ensureReady(): Promise<Application> {
    this.app ??= await this.initPromise;
    return this.app
  }

  private async prepareApp(config: ApplicationConfig): Promise<Application> {
    const { env, waitUntil } = await import('cloudflare:workers')
    const app = new Application({ ...config, env: env as Env, ctx: { waitUntil } })
    await app.initialize()
    return app
  }
}
