import { Seeder } from '@stratal/seeders'
import { inject, Transient } from 'stratal/di'
import { CasbinEnforcerService } from '@stratal/framework/rbac'

@Transient()
export class RbacSeeder extends Seeder {
  constructor(
    @inject(CasbinEnforcerService) private readonly enforcerService: CasbinEnforcerService,
  ) {
    super()
  }

  async run(): Promise<void> {
    await this.enforcerService.seedPolicies()
    await this.enforcerService.seedRoleHierarchy()
  }
}
