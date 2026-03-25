import { InertiaGet } from '@stratal/inertia'
import { Controller, type RouterContext } from 'stratal/router'

// Demonstrates: controller-first development — no Dashboard page file exists yet.
// The type generator should pick up the 'Dashboard' component and its props from this call.
@Controller('/dashboard')
export class DashboardController {
  @InertiaGet('/')
  async index(ctx: RouterContext) {
    return ctx.inertia('Dashboard', {
      stats: { total: 42, recent: 7 },
      activeUsers: 15,
    })
  }
}
