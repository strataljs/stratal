import type { Page } from '@inertiajs/core'
import { INERTIA_TOKENS, type SsrRendererService, type TemplateService } from '@stratal/inertia'
import { Transient, inject } from 'stratal/di'
import type { RouterContext } from 'stratal/router'
import { ROUTER_TOKENS } from 'stratal/router'
import { ModalBackgroundFetchError } from '../errors/modal-background-fetch.error'

export interface ModalData {
  component: string
  props: Record<string, unknown>
  baseURL: string
  redirectURL: string
  key: string
}

export interface ModalRenderOptions {
  baseURL: string
}

// Page from @inertiajs/core doesn't have a 'modal' prop — we extend it here
type PageWithModal = Page

// HonoApp extends OpenAPIHono which extends Hono — it has a standard fetch() method
interface FetchableApp {
  fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>
}

@Transient()
export class ModalService {
  constructor(
    @inject(ROUTER_TOKENS.HonoApp) private readonly app: FetchableApp,
    @inject(INERTIA_TOKENS.SsrRenderer) private readonly ssr: SsrRendererService,
    @inject(INERTIA_TOKENS.TemplateService) private readonly template: TemplateService,
  ) { }

  async render(
    ctx: RouterContext,
    component: string,
    props: Record<string, unknown>,
    options: ModalRenderOptions,
  ): Promise<Response> {
    const isInertia = ctx.c.req.header('x-inertia') === 'true'
    const partialComponent = ctx.c.req.header('x-inertia-partial-component')
    const partialData = ctx.c.req.header('x-inertia-partial-data')

    const redirectURL = this.resolveRedirectURL(ctx, options.baseURL)
    const key = ctx.c.req.header('x-inertia-modal-key') ?? crypto.randomUUID()
    const modalURL = new URL(ctx.c.req.url).pathname

    const modalData: ModalData = {
      component,
      props,
      baseURL: options.baseURL,
      redirectURL,
      key,
    }

    // Partial reload requesting 'modal' — skip background sub-request,
    // return just the modal prop with fresh data
    if (isInertia && partialComponent && partialData) {
      const requestedProps = partialData.split(',').map((s) => s.trim())
      if (requestedProps.includes('modal')) {
        const page: PageWithModal = {
          component: partialComponent,
          props: { modal: modalData, errors: {} },
          url: modalURL,
          version: null,
          flash: {},
          rememberedState: {},
          rescuedProps: [],
        }
        return new Response(JSON.stringify(page), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Inertia': 'true',
            'Vary': 'X-Inertia',
          },
        })
      }
    }

    // Fetch background page as an Inertia JSON request to get its component and
    // props without triggering SSR. We will run SSR ourselves below with the
    // combined page object so that page.url equals the modal URL in both the
    // SSR output and on the client — preventing React hydration mismatches.
    const bgResponse = await this.fetchBackground(ctx, redirectURL)
    const bgText = await bgResponse.text()
    if (!bgText || bgResponse.status >= 300) {
      throw new ModalBackgroundFetchError()
    }
    const bgPage = JSON.parse(bgText) as PageWithModal

    // Build the combined page: background props + modal data, URL = modal URL.
    // Setting url to the modal URL ensures Inertia's InitialVisit.handleDefault
    // calls history.replaceState with the modal URL (matching window.location),
    // so the address bar stays at the modal URL on direct visits.
    const combinedPage: PageWithModal = {
      ...bgPage,
      props: { ...bgPage.props, modal: modalData },
      url: modalURL,
    }

    if (isInertia) {
      // Inertia AJAX navigation: return JSON
      return new Response(JSON.stringify(combinedPage), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Inertia': 'true',
          'Vary': 'X-Inertia',
        },
      })
    }

    // Full-page (direct visit): run SSR with the combined page so that
    // page.url = modalURL in both the server-rendered HTML and the client
    // hydration pass. The Modal component renders null during SSR (effects
    // don't run server-side), so there is no hydration mismatch.
    const ssrResult = await this.ssr.render(combinedPage)
    const html = this.template.render(combinedPage, ssrResult.head, ssrResult.body)
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  private resolveRedirectURL(ctx: RouterContext, baseURL: string): string {
    const referer = ctx.c.req.header('referer')
    const isInertia = ctx.c.req.header('x-inertia') === 'true'

    if (isInertia && referer) {
      try {
        const refererURL = new URL(referer)
        const currentURL = new URL(ctx.c.req.url)
        if (refererURL.pathname !== currentURL.pathname) {
          // Preserve the query string so the background page (and the
          // post-close redirect) keeps the filter/pagination state the
          // user had on the list view — without this, opening a modal
          // resets the parent page to defaults.
          return refererURL.pathname + refererURL.search
        }
      }
      catch {
        // malformed referer — fall through to baseURL
      }
    }

    return baseURL
  }

  private async fetchBackground(ctx: RouterContext, url: string): Promise<Response> {
    const currentURL = new URL(ctx.c.req.url)
    const bgURL = new URL(url, currentURL.origin)

    const headers: Record<string, string> = {
      // Always request JSON — we run SSR ourselves with the combined page object
      'x-inertia': 'true',
      // Deliberately omit x-inertia-version: the InertiaMiddleware version check
      // returns a 409 with no body when versions don't match, which would make
      // JSON.parse fail. Internal sub-requests don't need cache-bust checks.
      'accept': 'application/json',
      // Forward auth/session cookies so the background request is authenticated
      'cookie': ctx.c.req.header('cookie') ?? '',
      // Forward the host header so domain-pattern middleware can match the
      // request against the configured domain pattern. Without this, the host
      // resolves to the URL's origin (e.g., localhost:1234) which won't match
      // patterns like '{tenant}.admsn.test', causing a DomainMismatchError.
      'host': ctx.c.req.header('host') ?? '',
    }

    // Forward proxy/forwarded-for headers when present so middleware that
    // reconstructs the canonical request URL (e.g. setting `appUrl` to
    // `https://...`) sees the same protocol/host the original request had.
    // Without this, downstream auth (better-auth's secure-cookie prefix is
    // derived from `baseURL`'s protocol) would look up the wrong cookie name
    // and the bg fetch would be unauthenticated — even though the cookie is
    // forwarded above.
    const passthrough = [
      'x-forwarded-proto',
      'x-forwarded-host',
      'x-forwarded-for',
      'x-forwarded-port',
      'x-real-ip',
      'accept-language',
      'user-agent',
    ] as const
    for (const name of passthrough) {
      const value = ctx.c.req.header(name)
      if (value) headers[name] = value
    }

    const bgRequest = new Request(bgURL.toString(), { method: 'GET', headers })

    return this.app.fetch(bgRequest, ctx.c.env, ctx.c.executionCtx)
  }
}
