import type { EventContext } from 'stratal/events'
import { Listener, On } from 'stratal/events'
import { inject } from 'tsyringe'
import { RBAC_TOKENS, type CasbinService } from '@stratal/framework/rbac'

@Listener()
export class UserRoleSyncListener {
  constructor(
    @inject(RBAC_TOKENS.CasbinService) private readonly casbinService: CasbinService,
  ) {}

  @On('after.User.create')
  async onUserCreated(context: EventContext<'after.User.create'>) {
    const user = context.result
    if (user?.role) {
      await this.casbinService.addRoleForUser(user.id, user.role)
    }
  }

  @On('after.User.update')
  async onUserUpdated(context: EventContext<'after.User.update'>) {
    const user = context.result
    if (user?.role) {
      await this.casbinService.deleteRolesForUser(user.id)
      await this.casbinService.addRoleForUser(user.id, user.role)
    }
  }
}
