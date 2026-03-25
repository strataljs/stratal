import type { DetectionStrategy, I18nModuleOptions } from 'stratal/i18n'
import { I18N_TOKENS } from 'stratal/i18n'
import type { TestingModule } from '../testing-module'

/**
 * Resolve the configured detection strategy from the testing module's DI container.
 * Falls back to 'cookie' if I18n is not configured.
 */
export function resolveLocaleStrategy(module: TestingModule): DetectionStrategy {
  try {
    const options = module.get<I18nModuleOptions>(I18N_TOKENS.Options)
    const detection = options.detection
    if (detection && 'strategy' in detection && detection.strategy) {
      return detection.strategy
    }
    return 'cookie'
  } catch {
    return 'cookie'
  }
}

/**
 * Apply locale to request headers based on detection strategy.
 */
export function applyLocaleToHeaders(
  headers: Headers,
  locale: string,
  strategy: DetectionStrategy,
): void {
  switch (strategy) {
    case 'cookie':
      headers.set('Cookie', `locale=${locale}`)
      break
    case 'header':
      headers.set('Accept-Language', locale)
      break
  }
}

/**
 * Apply locale to URL based on detection strategy.
 */
export function applyLocaleToUrl(
  url: URL,
  locale: string,
  strategy: DetectionStrategy,
): void {
  if (strategy === 'querystring') {
    url.searchParams.set('locale', locale)
  }
}
