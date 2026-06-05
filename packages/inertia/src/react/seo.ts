import type { PageProps } from '@inertiajs/core'
import { usePage } from '@inertiajs/react'
import type { SeoData } from '../seo/types'

interface SeoPageProps extends PageProps {
  seo?: SeoData
}

/**
 * Returns the resolved SEO data shared by the backend for the current page.
 *
 * The document head is kept in sync automatically (server injection on the
 * initial paint + the auto-injected client runtime on navigation); use this
 * hook only when you want to read the metadata inside a component.
 */
export function useSeo(): SeoData {
  return usePage<SeoPageProps>().props.seo ?? {}
}
