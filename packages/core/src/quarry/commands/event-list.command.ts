import { inject } from '../../di'
import { DI_TOKENS } from '../../di/tokens'
import { getListenerHandlers } from '../../events'
import type { ModuleRegistry } from '../../module/module-registry'
import { Command } from '../command'

export class EventListCommand extends Command {
  static command = 'event:list'
  static description = 'List all registered event listeners'

  constructor(@inject(DI_TOKENS.ModuleRegistry) private modules: ModuleRegistry) {
    super()
  }

  handle(): number | undefined {
    const listeners = this.modules.getAllListeners()

    if (listeners.length === 0) {
      this.info('No event listeners found')
      return 0
    }

    const rows: string[][] = []

    for (const ListenerClass of listeners) {
      const handlers = getListenerHandlers(ListenerClass)
      for (const { methodName, event, options } of handlers) {
        rows.push([
          event,
          ListenerClass.name,
          methodName,
          String(options?.priority ?? 0),
          options?.blocking ? 'Yes' : 'No',
        ])
      }
    }

    if (rows.length === 0) {
      this.info('No event handlers found')
      return 0
    }

    this.table(['Event', 'Listener', 'Method', 'Priority', 'Blocking'], rows)

    return undefined
  }
}
