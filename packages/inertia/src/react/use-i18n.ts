import type { PageProps } from '@inertiajs/core'
import { usePage } from '@inertiajs/react'
import IntlMessageFormat from 'intl-messageformat'
import { useMemo } from 'react'
import type { MessageParams } from 'stratal/i18n'
import type { InertiaTranslationKeys } from '../types'

interface I18nPageProps extends PageProps {
  locale: string
  translations: Record<string, string>
}

export function useI18n() {
  const { locale, translations } = usePage<I18nPageProps>().props

  const t = useMemo(() => {
    const compiled = new Map<string, IntlMessageFormat>()

    for (const [key, value] of Object.entries(translations)) {
      compiled.set(key, new IntlMessageFormat(value, locale))
    }

    return (key: InertiaTranslationKeys, params?: MessageParams): string => {
      const msg = compiled.get(key)
      if (!msg) return key
      return String(msg.format(params))
    }
  }, [locale, translations])

  return { t, locale }
}
