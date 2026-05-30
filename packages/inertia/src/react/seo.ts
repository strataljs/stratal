/// <reference lib="dom" />
import type { PageProps } from '@inertiajs/core'
import { usePage } from '@inertiajs/react'
import { useEffect, useLayoutEffect } from 'react'
import { applySeoToHead } from '../seo/apply-seo-to-head'
import type { SeoData } from '../seo/types'

interface SeoPageProps extends PageProps {
  seo?: SeoData
}

// Layout effect on the client (no head flash), plain effect on the server to
// avoid React's "useLayoutEffect does nothing on the server" warning.
const useIsomorphicEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect

/**
 * Returns the resolved SEO data shared by the backend for the current page.
 */
export function useSeo(): SeoData {
  return usePage<SeoPageProps>().props.seo ?? {}
}

/**
 * Keeps `document.head` in sync with the backend-resolved `seo` prop across
 * Inertia SPA navigations.
 *
 * Mount it once near the root of your app (e.g. in your client entry's `setup`).
 * The server already injects the SEO tags into `<head>` for the initial paint;
 * this component reconciles those same tags (marked with `data-seo`) on every
 * subsequent navigation. Renders nothing.
 */
export function Seo(): null {
  const seo = useSeo()

  useIsomorphicEffect(() => {
    if (typeof document === 'undefined') return
    applySeoToHead(seo)
  }, [JSON.stringify(seo)])

  return null
}
