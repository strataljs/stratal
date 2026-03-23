import { InertiaModule } from '@stratal/inertia'
import { Module } from 'stratal/module'
import { HomeController } from './home.controller'
import rootView from './inertia/root.html?raw'

@Module({
  imports: [
    InertiaModule.forRoot({
      rootView,
      ssr: { bundle: () => import('./inertia/ssr') },
    }),
  ],
  controllers: [HomeController],
})
export class AppModule { }
