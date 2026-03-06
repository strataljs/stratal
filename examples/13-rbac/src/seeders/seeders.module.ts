import { Module } from 'stratal/module'
import { AppModule } from '../app.module'
import { RbacSeeder } from './rbac.seeder'

@Module({
  imports: [AppModule],
  providers: [RbacSeeder],
})
export class SeedersModule {}
