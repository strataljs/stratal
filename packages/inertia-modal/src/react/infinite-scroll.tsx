import { InfiniteScroll as InertiaInfiniteScroll } from '@inertiajs/react'
import { forwardRef, useContext, useEffect, useState, type ComponentProps } from 'react'

import { modalPropPath } from '../core/wire'
import { ModalLevelContext } from './modal-context'
import { onLevelDismissed } from './scroll-teardown'

/**
 * Props of `@inertiajs/react`'s `<InfiniteScroll>`.
 *
 * Re-exported because Inertia does not export the interface itself, and a
 * declaration file cannot name a type it cannot import.
 */
export type InfiniteScrollProps = ComponentProps<typeof InertiaInfiniteScroll>

/**
 * `@inertiajs/react`'s `<InfiniteScroll>`, with `data` resolved against the modal it is rendered in.
 *
 * The component addresses its prop by name at the page root, and a level's props are nested under
 * one page prop. Import this one instead of the Inertia component and the same JSX works in a sheet
 * and on a page — outside a modal the name is already the path.
 *
 * @example
 * ```tsx
 * import { InfiniteScroll } from '@stratal/inertia-modal/react'
 *
 * <InfiniteScroll data="items">
 *   {items.data.map((item) => <Row key={item.id} item={item} />)}
 * </InfiniteScroll>
 * ```
 */
export const InfiniteScroll: typeof InertiaInfiniteScroll = forwardRef(
  function InfiniteScroll({ data, ...props }: InfiniteScrollProps, ref) {
    const level = useContext(ModalLevelContext)
    const url = level?.modal.url
    const [dismissed, setDismissed] = useState(false)

    useEffect(() => {
      if (url === undefined) return
      setDismissed(false)
      return onLevelDismissed(url, () => setDismissed(true))
    }, [url])

    // The subscription this renders lives inside Inertia's component, so not rendering it is what
    // ends the subscription. See `scroll-teardown` for why that cannot wait for the unmount.
    if (dismissed) return null

    return <InertiaInfiniteScroll {...props} data={level ? modalPropPath(data) : data} ref={ref} />
  },
)
