// Module
export { InertiaModule } from './inertia.module'

// Tokens
export { INERTIA_TOKENS } from './inertia.tokens'

// Options
export type { InertiaModuleOptions, InertiaSsrOptions } from './inertia.options'

// Types
export type {
  InertiaDeferredProp,
  InertiaMergeProp,
  InertiaOptionalProp,
  InertiaPage,
  InertiaRenderOptions,
  InertiaSsrBundle,
  InertiaSsrResult,
  SharedDataResolver,
  ViteManifest,
  ViteManifestEntry
} from './types'

// Services
export { InertiaService } from './services/inertia.service'
export { ManifestService } from './services/manifest.service'
export { SsrRendererService } from './services/ssr-renderer.service'
export { TemplateService } from './services/template.service'

// Middleware
export { InertiaMiddleware } from './middleware/inertia.middleware'

// Commands
export { InertiaBuildCommand } from './commands/inertia-build.command'
export { InertiaDevCommand } from './commands/inertia-dev.command'
export { InertiaInstallCommand } from './commands/inertia-install.command'

// Augmentation (side-effect imports: augments RouterContext and RouterVariables types)
import './augment/router-context'
import './augment/router-variables'
