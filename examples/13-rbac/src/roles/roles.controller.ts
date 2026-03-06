import { AuthGuard } from '@stratal/framework/guards'
import { RBAC_TOKENS, type CasbinService } from '@stratal/framework/rbac'
import { inject } from 'stratal/di'
import { UseGuards } from 'stratal/guards'
import { Controller, Route, type IController, type RouterContext } from 'stratal/router'
import { z } from 'stratal/validation'

@Controller('/api/roles')
@UseGuards(AuthGuard({ scopes: ['roles:*'] }))
export class RolesController implements IController {
  constructor(
    @inject(RBAC_TOKENS.CasbinService) private readonly casbinService: CasbinService,
  ) { }

  @Route({
    response: z.object({
      data: z.object({
        roles: z.array(z.string()),
      }),
    }),
    summary: 'Get current user roles',
  })
  async index(ctx: RouterContext) {
    const roles = await this.casbinService.getCurrentUserRoles()
    return ctx.json({ data: { roles } })
  }
}

@Controller('/api/roles/permissions')
@UseGuards(AuthGuard({ scopes: ['roles:*'] }))
export class RolesPermissionsController implements IController {
  constructor(
    @inject(RBAC_TOKENS.CasbinService) private readonly casbinService: CasbinService,
  ) { }

  @Route({
    response: z.object({
      data: z.record(z.string(), z.array(z.string())),
    }),
    summary: 'Get current user permissions (casbin.js format)',
  })
  async index(ctx: RouterContext) {
    const permissions = await this.casbinService.getCurrentUserPermissionsAsCasbinJs()
    return ctx.json({ data: permissions })
  }
}

@Controller('/api/roles/assign')
@UseGuards(AuthGuard({ scopes: ['roles:*'] }))
export class RolesAssignController implements IController {
  constructor(
    @inject(RBAC_TOKENS.CasbinService) private readonly casbinService: CasbinService,
  ) { }

  @Route({
    body: z.object({
      userId: z.string(),
      role: z.string(),
    }),
    response: z.object({
      success: z.boolean(),
    }),
    summary: 'Assign a role to a user',
  })
  async create(ctx: RouterContext) {
    const { userId, role } = await ctx.body<{ userId: string; role: string }>()
    const success = await this.casbinService.addRoleForUser(userId, role)
    return ctx.json({ success })
  }
}

@Controller('/api/roles/revoke')
@UseGuards(AuthGuard({ scopes: ['roles:*'] }))
export class RolesRevokeController implements IController {
  constructor(
    @inject(RBAC_TOKENS.CasbinService) private readonly casbinService: CasbinService,
  ) { }

  @Route({
    body: z.object({
      userId: z.string(),
      role: z.string(),
    }),
    response: z.object({
      success: z.boolean(),
    }),
    summary: 'Revoke a role from a user',
  })
  async create(ctx: RouterContext) {
    const { userId, role } = await ctx.body<{ userId: string; role: string }>()
    const success = await this.casbinService.deleteRoleForUser(userId, role)
    return ctx.json({ success })
  }
}
