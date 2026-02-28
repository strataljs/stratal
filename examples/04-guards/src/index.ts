import 'reflect-metadata'
import { StratalWorker } from 'stratal/worker'
import { AppModule } from './app.module'

declare module 'stratal' {
  interface StratalEnv {
    API_KEY: string
  }
}

export default class Worker extends StratalWorker {
  protected configure() {
    return { module: AppModule }
  }
}
