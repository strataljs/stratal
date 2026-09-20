// The way a sheet is opened.
//
// The visit options live here rather than in a constant a consumer spreads: an exported options
// object can be forgotten at one call site, and the failure is silent — the sheet opens, but the
// page beneath is re-sent with it.
import { Link } from '@inertiajs/react'
import type { ComponentProps } from 'react'

import { MODAL_PROP } from '../core/wire'

export type ModalLinkProps = ComponentProps<typeof Link>

/**
 * Opens a modal route as a sheet over the current page.
 *
 * @example
 * ```tsx
 * <ModalLink href="/parent/1/edit">Edit</ModalLink>
 * <ModalLink href="/parent/1/edit" prefetch>Edit</ModalLink>
 * ```
 */
export function ModalLink({ children, ...rest }: ModalLinkProps) {
  return (
    <Link
      // Narrows what the SERVER sends to the level alone. `preserveState` keeps the page behind from
      // remounting; `preserveScroll` keeps its position, which is where the reader returns.
      only={[MODAL_PROP]}
      preserveState
      preserveScroll
      {...rest}
    >
      {children}
    </Link>
  )
}
