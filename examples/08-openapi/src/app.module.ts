import { Module } from 'stratal/module'
import { OpenAPIModule } from 'stratal/openapi'
import { UsersModule } from './users/users.module'

@Module({
  imports: [
    OpenAPIModule.forRoot({
      info: {
        title: 'Users API',
        version: '1.0.0',
        description: 'A sample API demonstrating OpenAPI documentation with Stratal',
      },
    }),
    UsersModule,
  ],
})
export class AppModule {}
