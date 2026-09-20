import { Deferred as InertiaDeferred } from '@inertiajs/react'
import { useContext, type ComponentProps } from 'react'

import { modalPropPath } from '../core/wire'
import { ModalLevelContext } from './modal-context'

/**
 * Props of `@inertiajs/react`'s `<Deferred>`.
 *
 * Re-exported because Inertia does not export the interface itself, and a
 * declaration file cannot name a type it cannot import.
 */
export type DeferredProps = ComponentProps<typeof InertiaDeferred>

function resolve(data: string | string[], nested: boolean): string | string[] {
  if (!nested) return data
  return Array.isArray(data) ? data.map(modalPropPath) : modalPropPath(data)
}

/**
 * `@inertiajs/react`'s `<Deferred>`, with `data` resolved against the modal it is rendered in.
 *
 * The component addresses its prop by name at the page root, and a level's props are nested under
 * one page prop. Import this one instead of the Inertia component and the same JSX works in a sheet
 * and on a page — outside a modal the name is already the path.
 *
 * @example
 * ```tsx
 * import { Deferred } from '@stratal/inertia-modal/react'
 *
 * <Deferred data="entries" fallback={<Skeleton />}>
 *   <Entries entries={entries} />
 * </Deferred>
 * ```
 */
export const Deferred: typeof InertiaDeferred = Object.assign(
  function Deferred({ data, ...props }: DeferredProps) {
    const level = useContext(ModalLevelContext)
    return <InertiaDeferred {...props} data={resolve(data, level !== null)} />
  },
  { displayName: 'Deferred' },
)
