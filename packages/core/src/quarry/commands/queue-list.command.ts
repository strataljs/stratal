import { inject } from '../../di'
import { DI_TOKENS } from '../../di/tokens'
import type { ConsumerRegistry } from '../../queue/consumer-registry'
import { Command } from '../command'

export class QueueListCommand extends Command {
  static command = 'queue:list'
  static description = 'List all registered queue consumers'

  constructor(@inject(DI_TOKENS.ConsumerRegistry) private consumers: ConsumerRegistry) {
    super()
  }

  handle(): number | undefined {
    const consumers = this.consumers.getAllConsumers()

    if (consumers.length === 0) {
      this.info('No queue consumers found')
      return 0
    }

    this.table(
      ['Consumer', 'Message Types'],
      consumers.map(c => [c.constructor.name, c.messageTypes.join(', ')]),
    )

    return undefined
  }
}
