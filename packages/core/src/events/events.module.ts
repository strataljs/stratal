import { DI_TOKENS } from '../di/tokens'
import { Module } from '../module/module.decorator'
import { EventRegistry } from './event-registry'

/**
 * Registers the event registry (`DI_TOKENS.EventRegistry`).
 *
 * Lazy: loaded on demand via `LazyModuleLoader` — by the framework's
 * `DatabaseModule` (which needs it to wire DB event emission) and by the
 * application's event-listener trigger paths. Kept out of cold start for apps
 * that neither emit events nor use the database.
 */
@Module({
  providers: [
    { provide: DI_TOKENS.EventRegistry, useClass: EventRegistry },
  ],
})
export class EventsModule { }
