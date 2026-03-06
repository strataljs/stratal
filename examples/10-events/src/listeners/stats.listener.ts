import { Listener, On } from 'stratal/events'

@Listener()
export class StatsListener {
  static counts = { notify: 0, index: 0, webhook: 0 }

  @On('note.notify')
  onNotify() {
    StatsListener.counts.notify++
    console.log(`[Stats] Total notifications dispatched: ${StatsListener.counts.notify}`)
  }

  @On('note.index')
  onIndex() {
    StatsListener.counts.index++
    console.log(`[Stats] Total search index updates: ${StatsListener.counts.index}`)
  }

  @On('note.webhook')
  onWebhook() {
    StatsListener.counts.webhook++
    console.log(`[Stats] Total webhooks dispatched: ${StatsListener.counts.webhook}`)
  }
}
