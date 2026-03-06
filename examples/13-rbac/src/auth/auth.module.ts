import { Module } from 'stratal/module'
import { AuthController } from './auth.controller'

@Module({
  controllers: [AuthController],
})
export class AuthModule {}
