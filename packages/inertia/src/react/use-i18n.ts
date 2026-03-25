/**
 * React hook for using Stratal's i18n translations on the frontend.
 *
 * Reads `locale` and `translations` from Inertia shared props (injected by
 * the `i18n` option on {@link InertiaModuleOptions}) and provides a type-safe
 * `t()` function powered by `@intlify/core-base`.
 *
 * @module
 */

import type { PageProps } from '@inertiajs/core'
import { usePage } from '@inertiajs/react'
import { createCoreContext, translate } from '@intlify/core-base'
import { useMemo } from 'react'
import type { MessageKeys, MessageParams } from 'stratal/i18n'
import { setupI18nCompiler } from 'stratal/i18n/utils'

// Register JIT message compiler (CSP-safe, AST mode — same as server's setupI18nCompiler)
setupI18nCompiler()

interface I18nPageProps extends PageProps {
  locale: string
  translations: Record<string, string>
}

/**
 * Hook that provides i18n translation capabilities in React components.
 *
 * Consumes `locale` and `translations` from Inertia shared props and returns
 * a `t()` function that translates message keys with optional interpolation.
 *
 * Requires the `i18n` option to be set on `InertiaModule.forRoot()` to inject
 * the shared props.
 *
 * @returns An object with:
 * - `t` — Translation function accepting a message key and optional params
 * - `locale` — The current locale string
 *
 * @example
 * ```tsx
 * import { useI18n } from '@stratal/inertia/react'
 *
 * export default function Header() {
 *   const { t, locale } = useI18n()
 *
 *   return (
 *     <header>
 *       <h1>{t('common.title')}</h1>
 *       <p>{t('common.greeting', { name: 'World' })}</p>
 *       <span>Locale: {locale}</span>
 *     </header>
 *   )
 * }
 * ```
 */
export function useI18n() {
  const { locale, translations } = usePage<I18nPageProps>().props

  const context = useMemo(
    () => createCoreContext({
      locale,
      messages: { [locale]: translations },
      missingWarn: !import.meta.env.PROD,
      fallbackWarn: !import.meta.env.PROD,
    }),
    [locale, translations],
  )

  const t = useMemo(
    () => (key: MessageKeys, params?: MessageParams): string => {
      const result = params !== undefined
        ? translate(context, key, params)
        : translate(context, key)
      return typeof result === 'string' ? result : key
    },
    [context],
  )

  return { t, locale }
}
