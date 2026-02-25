export {
  Controller, getControllerOptions, getControllerRoute
} from './controller.decorator'
export { getDecoratedMethods, getRouteConfig, Route } from './route.decorator'

// Guards are now exported from core/guards module
// Use: import { UseGuards, AuthGuard } from 'stratal/guards'

// TenantController and UniversalController are now exported from tenancy module
// Use: import { TenantController, UniversalController } from 'stratal/tenancy'
