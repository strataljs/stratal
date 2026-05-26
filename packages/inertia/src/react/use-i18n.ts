import type { PageProps } from '@inertiajs/core'
import { usePage } from '@inertiajs/react'
import MessageFormat from '@messageformat/core'
import { useMemo } from 'react'
import type { MessageKeys, MessageParams } from 'stratal/i18n'

interface I18nPageProps extends PageProps {
  locale: string
  translations: Record<string, string>
}

export function useI18n() {
  const { locale, translations } = usePage<I18nPageProps>().props

  const t = useMemo(() => {
    const mf = new MessageFormat(locale)
    const compiled = new Map<string, (params?: Record<string, unknown>) => string>()

    for (const [key, value] of Object.entries(translations)) {
      try {
        compiled.set(key, mf.compile(value) as (params?: Record<string, unknown>) => string)
      } catch {
        compiled.set(key, () => value)
      }
    }

    return (key: MessageKeys, params?: MessageParams): string => {
      const fn = compiled.get(key)
      if (!fn) return key
      try {
        return fn(params as Record<string, unknown>)
      } catch {
        return key
      }
    }
  }, [locale, translations])

  return { t, locale }
}
