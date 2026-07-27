// Module
export { InertiaModule } from './inertia.module';

// Tokens
export { INERTIA_TOKENS } from './inertia.tokens';

// Options
export type { InertiaFlashOptions, InertiaI18nOptions, InertiaModuleOptions, InertiaSeoOptions, InertiaSsrOptions } from './inertia.options';

// SEO
export { buildSeoTags, DATA_SEO_ATTR, descriptorToHtml } from './seo/build-seo-tags';
export type { SeoData, SeoLinkTag, SeoMetaTag, SeoOpenGraph, SeoTagDescriptor, SeoTwitter } from './seo/types';

// Types
export type {
    InertiaAlwaysProp,
    InertiaDeferredProp,
    InertiaFullPageProps,
    InertiaI18nConfig,
    InertiaTranslationKeys,
    InertiaMergeProp,
    InertiaMergeStrategy,
    InertiaOnceProp,
    InertiaOptionalProp,
    InertiaPage,
    InertiaPageComponent,
    InertiaPageRegistry,
    InertiaRenderOptions,
    InertiaSharedProps,
    InertiaSsrBundle,
    InertiaSsrResult,
    ResolvedInertiaPageProps,
    SharedDataResolver,
    ViteManifest,
    ViteManifestEntry
} from './types';

// Access control
export type {
    AccessControlRegistry,
    AccessControlRegistryNotGenerated,
    Check,
    Permission,
    RoleName,
    SharedAccess
} from './access/types';

// Flash
export { CookieFlashStore } from './flash/cookie-flash-store';
export type { FlashStore } from './flash/flash-store';

// Services
export { InertiaService } from './services/inertia.service';
export { SeoService } from './services/seo.service';
export { ManifestService } from './services/manifest.service';
export { SsrRendererService } from './services/ssr-renderer.service';
export { TemplateService } from './services/template.service';
export { DocumentRendererService } from './services/document-renderer.service';

// Decorators
export { InertiaDelete, InertiaGet, InertiaPatch, InertiaPost, InertiaPut, InertiaRoute } from './decorators/inertia.decorators';
export type { InertiaRouteConfig } from './decorators/inertia.decorators';

// Middleware
export { HandlePrecognitiveRequests } from './middleware/handle-precognitive-requests.middleware';
export { InertiaMiddleware } from './middleware/inertia.middleware';

// Augmentation (side-effect imports: augments RouterContext and RouterVariables types)
import './augment/router-context';
import './augment/router-variables';
