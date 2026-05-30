import { ApplicationError, type ApplicationErrorConstructor, type ExceptionHandler, type HttpExceptionContext } from 'stratal/errors'
import type { AsyncModuleOptions, DynamicModule, OnException, OnInitialize } from 'stratal/module'
import { Module } from 'stratal/module'
import { SchemaValidationError, type RouteConfigurable, type Router } from 'stratal/router'
import { augmentRouterContext } from './augment/router-context'
import type { InertiaModuleOptions } from './inertia.options'
import { INERTIA_TOKENS } from './inertia.tokens'
import { InertiaMiddleware } from './middleware/inertia.middleware'
import { HreflangService } from './services/hreflang.service'
import { InertiaService } from './services/inertia.service'
import { ManifestService } from './services/manifest.service'
import { SeoService } from './services/seo.service'
import { SsrRendererService } from './services/ssr-renderer.service'
import { TemplateService } from './services/template.service'

@Module({
  providers: [
    { provide: INERTIA_TOKENS.InertiaService, useClass: InertiaService },
    { provide: INERTIA_TOKENS.TemplateService, useClass: TemplateService },
    { provide: INERTIA_TOKENS.ManifestService, useClass: ManifestService },
    { provide: INERTIA_TOKENS.SsrRenderer, useClass: SsrRendererService },
    { provide: INERTIA_TOKENS.HreflangService, useClass: HreflangService },
    { provide: INERTIA_TOKENS.SeoService, useClass: SeoService },
  ],
})
export class InertiaModule implements RouteConfigurable, OnInitialize, OnException {
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

  configureRoutes(router: Router): void {
    router.use(InertiaMiddleware)
  }

  onException(handler: ExceptionHandler): void {
    // Convert Zod validation errors to Inertia form errors
    handler.renderable(SchemaValidationError, (error, context) => {
      if (context.type !== 'http') return undefined

      if (this.isPrecognitionRequest(context)) {
        return this.handlePrecognitionValidationError(error, context)
      }

      if (!this.isInertiaRequest(context)) return undefined

      const issues = error.issues ?? []
      const errors: Record<string, string> = {}
      for (const issue of issues) {
        errors[issue.path] = issue.message
      }

      context.ctx.flash('errors', errors)
      return this.redirectBack(context)
    })

    // Convert business ApplicationErrors to Inertia form-level errors
    handler.renderable(ApplicationError as unknown as ApplicationErrorConstructor, (error, context) => {
      if (context.type !== 'http') return undefined

      const message = error.message

      if (this.isPrecognitionRequest(context)) {
        return this.createPrecognitionErrorResponse({ _form: message })
      }

      if (!this.isInertiaRequest(context)) return undefined

      context.ctx.flash('errors', { _form: message } as const)
      return this.redirectBack(context)
    })

    // Render full Inertia error pages for HTTP HTML requests. Convention:
    // consumers ship `pages/Errors/${status}.tsx` (e.g. Errors/404, Errors/500).
    handler.errorPage(async (errorResponse, status, context) => {
      try {
        const inertia = context.ctx.getContainer().resolve<InertiaService>(INERTIA_TOKENS.InertiaService)
        return await inertia.render(
          context.ctx,
          `Errors/${status}`,
          { status, message: errorResponse.message },
          { status },
        )
      } catch {
        return undefined
      }
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

  private isPrecognitionRequest(context: HttpExceptionContext): boolean {
    return context.ctx.header('precognition') === 'true'
  }

  private handlePrecognitionValidationError(error: SchemaValidationError, context: HttpExceptionContext): Response {
    const issues = error.issues ?? []
    let errors: Record<string, string> = {}
    for (const issue of issues) {
      errors[issue.path] = issue.message
    }

    // Filter to only requested fields if Precognition-Validate-Only is present
    const validateOnly = context.ctx.header('precognition-validate-only')
    if (validateOnly) {
      const fields = validateOnly.split(',').map(f => f.trim())
      const filtered: Record<string, string> = {}
      for (const field of fields) {
        if (errors[field]) {
          filtered[field] = errors[field]
        }
      }
      errors = filtered
    }

    // If after filtering there are no errors for the requested fields, treat as success
    if (Object.keys(errors).length === 0) {
      return new Response(null, {
        status: 204,
        headers: {
          'Precognition': 'true',
          'Precognition-Success': 'true',
          'Vary': 'Precognition',
        },
      })
    }

    return this.createPrecognitionErrorResponse(errors)
  }

  private createPrecognitionErrorResponse(errors: Record<string, string>): Response {
    return new Response(JSON.stringify({ errors }), {
      status: 422,
      headers: {
        'Content-Type': 'application/json',
        'Precognition': 'true',
        'Vary': 'Precognition',
      },
    })
  }

  private redirectBack(context: HttpExceptionContext): Response {
    const referer = context.ctx.header('referer')
    if (referer) {
      const parsed = new URL(referer)
      const url = parsed.search ? `${parsed.pathname}${parsed.search}` : parsed.pathname
      return context.ctx.redirect(url, 303)
    }
    return context.ctx.redirect('/', 303)
  }
}
