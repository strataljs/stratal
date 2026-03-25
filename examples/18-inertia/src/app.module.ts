import { InertiaModule } from '@stratal/inertia'
import { I18nModule } from 'stratal/i18n'
import { Module } from 'stratal/module'
import type { RouterContext } from 'stratal/router'
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
      sharedData: {
        appName: 'Stratal Notes',
        flash: (ctx: RouterContext) => ctx.header('x-flash-message') || null,
      },
      i18n: { only: ['common'] },
    }),
    I18nModule.registerMessages(i18nMessages),
    // Alternative async configuration:
    // InertiaModule.forRootAsync({
    //   inject: [DI_TOKENS.CloudflareEnv],
    //   useFactory: (env: StratalEnv) => ({
    //     rootView,
    //     version: env.APP_VERSION,
    //     ssr: { bundle: () => import('./inertia/ssr') },
    //     sharedData: { appName: 'Stratal Notes' },
    //   }),
    // }),

    NotesModule,
  ],
  controllers: [HomeController],
})
export class AppModule { }
