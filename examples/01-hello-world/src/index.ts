import { StratalWorker } from 'stratal/worker'
import { AppModule } from './app.module'

export default class Worker extends StratalWorker {
  protected configure() {
    return { module: AppModule }
  }
}
