import { CanActivate, DI_TOKENS, RouterContext, Transient } from 'stratal'
import type { StratalEnv } from 'stratal'
import { inject } from 'tsyringe'

@Transient()
export class ApiKeyGuard implements CanActivate {
  constructor(@inject(DI_TOKENS.CloudflareEnv) private readonly env: StratalEnv) {}

  canActivate(context: RouterContext): boolean {
    const apiKey = context.header('x-api-key')
    return apiKey === this.env.API_KEY
  }
}
