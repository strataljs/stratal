import 'reflect-metadata'

import { WorkerEntrypoint } from 'cloudflare:workers'
import { Application, type ApplicationConfig } from '../application'
import type { StratalEnv } from '../env'
import { ROUTER_TOKENS, type RouterService } from '../router'

/**
 * Per-class singleton registry
 * Key: Worker class constructor
 * Value: { app, promise } for singleton + concurrent init guard
 */
const registry = new Map<
	unknown,
	{ app: Application | null; promise: Promise<Application> | null }
>()

/**
 * Base class for Cloudflare Workers using the modules framework.
 * Handles Application singleton management and provides default handlers.
 *
 * @example
 * ```typescript
 * export default class Backend extends StratalWorker<Cloudflare.Env> {
 *   protected configure() {
 *     return {
 *       module: AppModule,
 *       logging: { level: LogLevel.INFO },
 *     }
 *   }
 * }
 * ```
 */
export abstract class StratalWorker<
	Env extends StratalEnv = StratalEnv
> extends WorkerEntrypoint<Env> {
	/**
	 * Configure the Application.
	 * Access `this.env` and `this.ctx` for environment-dependent config.
	 */
	protected abstract configure(): ApplicationConfig

	/**
	 * Get or initialize the Application singleton.
	 * Handles concurrent initialization guards automatically.
	 */
	protected async getApp(): Promise<Application> {
		const key = this.constructor
		let state = registry.get(key)

		if (!state) {
			state = { app: null, promise: null }
			registry.set(key, state)
		}

		// Fast path: already initialized
		if (state.app) {
			return state.app
		}

		// Concurrent initialization guard
		if (state.promise) {
			return state.promise
		}

		// Start initialization
		state.promise = this.initializeApp()

		try {
			state.app = await state.promise
			return state.app
		} finally {
			state.promise = null
		}
	}

	private async initializeApp(): Promise<Application> {
		const config = this.configure()
		const app = new Application(this.env, this.ctx, config)
		await app.initialize()
		return app
	}

	/**
	 * Handle HTTP requests via RouterService.
	 * Override for custom request handling.
	 */
	async fetch(request: Request): Promise<Response> {
		const app = await this.getApp()
		const router = app.resolve<RouterService>(ROUTER_TOKENS.RouterService)
		return router.fetch(request, this.env, this.ctx)
	}

	/**
	 * Handle queue batches.
	 * Override for custom queue handling.
	 */
	async queue(batch: MessageBatch): Promise<void> {
		const app = await this.getApp()
		return app.handleQueue(batch, batch.queue)
	}

	/**
	 * Handle scheduled cron triggers.
	 * Override for custom scheduled handling.
	 */
	async scheduled(controller: ScheduledController): Promise<void> {
		const app = await this.getApp()
		return app.handleScheduled(controller)
	}
}
