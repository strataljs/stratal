import { Scope } from 'stratal/di'
import { ApplicationError, type ApplicationErrorConstructor, type ExceptionHandler, type HttpExceptionContext } from 'stratal/errors'
import type { MiddlewareConfigurable, MiddlewareConsumer } from 'stratal/middleware'
import type { AsyncModuleOptions, DynamicModule, OnException, OnInitialize } from 'stratal/module'
import { Module } from 'stratal/module'
import { SchemaValidationError } from 'stratal/router'
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
    { provide: INERTIA_TOKENS.SsrRenderer, useClass: SsrRendererService, scope: Scope.Singleton },
    InertiaInstallCommand,
    InertiaTypesCommand,
    InertiaDevCommand,
    InertiaBuildCommand,
  ],
})
export class InertiaModule implements MiddlewareConfigurable, OnInitialize, OnException {
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

  onException(handler: ExceptionHandler): void {
    // Convert Zod validation errors to Inertia form errors
    handler.renderable(SchemaValidationError, (error, context) => {
      if (context.type !== 'http' || !this.isInertiaRequest(context)) return undefined

      const issues = (error.metadata?.issues as { path: string; message: string }[]) ?? []
      const errors: Record<string, string> = {}
      for (const issue of issues) {
        errors[issue.path] = issue.message
      }

      context.ctx.flash('errors', errors)
      return this.redirectBack(context)
    })

    // Convert business ApplicationErrors to Inertia form-level errors
    handler.renderable(ApplicationError as unknown as ApplicationErrorConstructor, (error, context) => {
      if (context.type !== 'http' || !this.isInertiaRequest(context)) return undefined

      context.ctx.flash('errors', { _form: error.message } as const)
      return this.redirectBack(context)
    })
  }

  onInitialize(): void {
    augmentRouterContext((ctx) => {
      const requestContainer = ctx.getContainer()
      return requestContainer.resolve<InertiaService>(INERTIA_TOKENS.InertiaService)
    })
  }

  private isInertiaRequest(context: HttpExceptionContext): boolean {
    return context.ctx.header('x-inertia') === 'true'
  }

  private redirectBack(context: HttpExceptionContext): Response {
    const referer = context.ctx.header('referer')
    const url = referer ? new URL(referer).pathname : '/'
    return context.ctx.redirect(url, 303)
  }
}
