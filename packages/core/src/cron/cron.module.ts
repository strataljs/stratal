import { DI_TOKENS } from '../di/tokens'
import { Module } from '../module/module.decorator'
import { CronManager } from './cron-manager'

/**
 * Registers the cron manager (`DI_TOKENS.Cron`).
 *
 * Lazy: loaded on demand via `await import()` — by `Application.ensureCron`
 * (first scheduled trigger, or at bootstrap when the app declares jobs) and by
 * the `schedule:list` command. Kept out of cold start for apps without cron.
 */
@Module({
  providers: [
    { provide: DI_TOKENS.Cron, useClass: CronManager },
  ],
})
export class CronModule { }
