import { CookieFlashStore, InertiaModule } from '@stratal/inertia'
import { I18nModule } from 'stratal/i18n'
import { Module } from 'stratal/module'
import { DashboardController } from './dashboard/dashboard.controller'
import { HomeController } from './home.controller'
import i18nMessages from './i18n/messages'
import rootView from './inertia/root.html?raw'
import { NotesModule } from './notes/notes.module'

@Module({
  imports: [
    InertiaModule.forRoot({
      rootView,
      version: '1.0.0',
      ssr: { bundle: () => import('./inertia/ssr') },
      flash: {
        store: new CookieFlashStore({ secret: 'example-secret-key-change-in-production' }),
      },
      sharedData: {
        appName: 'Stratal Notes',
      },
      i18n: { only: ['common'] },
    }),
    I18nModule.registerMessages(i18nMessages),

    NotesModule,
  ],
  controllers: [HomeController, DashboardController],
})
export class AppModule { }
