import type { MiddlewareConfigurable, MiddlewareConsumer } from 'stratal/middleware'
import type { AsyncModuleOptions, DynamicModule, OnInitialize } from 'stratal/module'
import { Module } from 'stratal/module'
import { augmentRouterContext } from './augment/router-context'
import { InertiaBuildCommand } from './commands/inertia-build.command'
import { InertiaDevCommand } from './commands/inertia-dev.command'
import { InertiaInstallCommand } from './commands/inertia-install.command'
import { InertiaTypesCommand } from './commands/inertia-types.command'
import type { InertiaModuleOptions } from './inertia.options'
import { INERTIA_TOKENS } from './inertia.tokens'
import { InertiaMiddleware } from './middleware/inertia.middleware'
import { InertiaService } from './services/inertia.service'
import { ManifestService } from './services/manifest.service'
import { SsrRendererService } from './services/ssr-renderer.service'
import { TemplateService } from './services/template.service'

@Module({
  providers: [
    { provide: INERTIA_TOKENS.InertiaService, useClass: InertiaService },
    { provide: INERTIA_TOKENS.TemplateService, useClass: TemplateService },
    { provide: INERTIA_TOKENS.ManifestService, useClass: ManifestService },
    { provide: INERTIA_TOKENS.SsrRenderer, useClass: SsrRendererService },
    InertiaInstallCommand,
    InertiaTypesCommand,
    InertiaDevCommand,
    InertiaBuildCommand,
  ],
})
export class InertiaModule implements MiddlewareConfigurable, OnInitialize {
  static forRoot(options: InertiaModuleOptions): DynamicModule {
    return {
      module: InertiaModule,
      providers: [
        { provide: INERTIA_TOKENS.Options, useValue: options },
      ],
    }
  }

  static forRootAsync(options: AsyncModuleOptions<InertiaModuleOptions>): DynamicModule {
    return {
      module: InertiaModule,
      providers: [
        {
          provide: INERTIA_TOKENS.Options,
          useFactory: options.useFactory,
          inject: options.inject,
        },
      ],
    }
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(InertiaMiddleware).forRoutes('*')
  }

  onInitialize(): void {
    augmentRouterContext((ctx) => {
      const requestContainer = ctx.getContainer()
      return requestContainer.resolve<InertiaService>(INERTIA_TOKENS.InertiaService)
    })
  }
}
