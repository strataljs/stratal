/**
 * Interface for cron jobs that can be registered by modules
 *
 * Cron jobs are executed when Cloudflare triggers match their schedule.
 * Jobs are registered via the module's getCronJobs() method.
 *
 * @example
 * ```typescript
 * @Transient()
 * export class DataCleanupJob implements CronJob {
 *   readonly schedule = '0 2 * * *' // Daily at 2 AM UTC
 *
 *   constructor(
 *     @inject(LOGGER_TOKENS.LoggerService) private logger: LoggerService,
 *   ) {}
 *
 *   async execute(controller: ScheduledController): Promise<void> {
 *     this.logger.info('Running data cleanup')
 *     await this.cleanupExpiredData()
 *   }
 *
 *   async onError(error: Error): Promise<void> {
 *     this.logger.error('Data cleanup failed', { error: error.message })
 *   }
 * }
 * ```
 */
export interface CronJob {
	/**
	 * Cron expression that triggers this job
	 *
	 * Must match a cron trigger defined in wrangler.jsonc
	 * @example '0 2 * * *' // Daily at 2 AM UTC
	 * @example '* /15 * * * *' // Every 15 minutes
	 */
	readonly schedule: string

	/**
	 * Execute the cron job
	 *
	 * @param controller - Cloudflare ScheduledController with scheduledTime and cron
	 * @throws ApplicationError for expected errors
	 */
	execute(controller: ScheduledController): Promise<void>

	/**
	 * Optional error handler for job execution failures
	 *
	 * If not provided, errors are logged via GlobalErrorHandler
	 *
	 * @param error - Error that occurred during execution
	 * @param controller - Cloudflare ScheduledController
	 */
	onError?(error: Error, controller: ScheduledController): Promise<void>
}
