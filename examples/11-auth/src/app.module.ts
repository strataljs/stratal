import { AuthModule as CoreAuthModule } from '@stratal/framework/auth'
import type { StratalEnv } from 'stratal'
import { DI_TOKENS } from 'stratal/di'
import { Module } from 'stratal/module'

import { createAuthOptions } from './auth/auth.config'
import { AuthModule } from './auth/auth.module'
import { ProfileModule } from './profile/profile.module'
import { PublicModule } from './public/public.module'

@Module({
  imports: [
    CoreAuthModule.withRootAsync({
      inject: [DI_TOKENS.CloudflareEnv],
      useFactory: (env: StratalEnv) => createAuthOptions(env),
    }),
    AuthModule,
    ProfileModule,
    PublicModule,
  ],
})
export class AppModule { }
