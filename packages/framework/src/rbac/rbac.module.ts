import { Module } from 'stratal/module'
import type { AsyncModuleOptions, DynamicModule } from 'stratal/module'
import { CasbinEnforcerService } from './services/casbin-enforcer.service'
import { CasbinService } from './services/casbin.service'
import { RBAC_TOKENS } from './tokens'
import type { RbacModuleOptions } from './types'

/**
 * RBAC Module
 *
 * Provides role-based access control using Casbin.
 * Fully configurable — no hardcoded roles, policies, or model.
 *
 * @example
 * ```typescript
 * @Module({
 *   imports: [
 *     RbacModule.forRoot({
 *       model: MY_RBAC_MODEL,
 *       defaultPolicies: [['admin', 'users:*', '.*']],
 *       roleHierarchy: [['super_admin', 'admin']],
 *     })
 *   ]
 * })
 * ```
 */
@Module({
  providers: [
    CasbinEnforcerService,
    { provide: RBAC_TOKENS.CasbinService, useClass: CasbinService },
  ],
})
export class RbacModule {
  static forRoot(options: RbacModuleOptions): DynamicModule {
    return {
      module: RbacModule,
      providers: [
        { provide: RBAC_TOKENS.Options, useValue: options as unknown as object },
      ],
    }
  }

  static forRootAsync(options: AsyncModuleOptions<RbacModuleOptions>): DynamicModule {
    return {
      module: RbacModule,
      providers: [
        {
          provide: RBAC_TOKENS.Options,
          useFactory: options.useFactory,
          inject: options.inject,
        },
      ],
    }
  }
}
