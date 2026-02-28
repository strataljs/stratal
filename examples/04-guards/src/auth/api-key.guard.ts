import type { StratalEnv } from 'stratal'
import { DI_TOKENS, inject, Transient } from 'stratal/di'
import { CanActivate } from 'stratal/guards'
import { RouterContext } from 'stratal/router'

@Transient()
export class ApiKeyGuard implements CanActivate {
  constructor(@inject(DI_TOKENS.CloudflareEnv) private readonly env: StratalEnv) {}

  canActivate(context: RouterContext): boolean {
    const apiKey = context.header('x-api-key')
    return apiKey === this.env.API_KEY
  }
}
