import { Stratal } from 'stratal'
import { AppModule } from './app.module'

declare module 'stratal' {
  interface StratalEnv {
    API_KEY: string
  }
}

export default new Stratal({ module: AppModule })
