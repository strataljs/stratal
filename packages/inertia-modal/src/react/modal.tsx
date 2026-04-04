import type { PageProps } from '@inertiajs/core'
import { router, usePage } from '@inertiajs/react'
import { type ComponentType, useEffect, useState } from 'react'
import type { ModalData } from '../services/modal.service'
import { resolver } from './resolver'

interface ModalPageProps extends PageProps {
  modal?: ModalData
}

/**
 * Headless modal component. Place this anywhere in your layout.
 *
 * When the current Inertia page has `props.modal` (set by `ctx.inertiaModal()`
 * on the server), this component dynamically loads the modal page component and
 * renders it as an overlay. The background page is what Inertia renders normally.
 *
 * @example
 * ```tsx
 * // dashboard-layout.tsx
 * import { Modal } from '@stratal/inertia-modal/react'
 *
 * export function DashboardLayout({ children }) {
 *   return (
 *     <>
 *       <Sidebar />
 *       <main>{children}</main>
 *       <Modal />
 *     </>
 *   )
 * }
 * ```
 */
export function Modal() {
  const page = usePage<ModalPageProps>()
  const modal = page.props.modal

  const [Component, setComponent] = useState<ComponentType<Record<string, unknown>> | null>(null)

  useEffect(() => {
    if (!modal?.component) {
      setComponent(null)
      return
    }

    Promise.resolve(resolver.resolve(modal.component))
      .then((mod) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const component = (mod as any)?.default ?? mod
        setComponent(() => component as ComponentType<Record<string, unknown>>)
      })
      .catch(() => setComponent(null))
  // Re-load the component whenever nonce changes (new modal or refreshed props)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal?.nonce])

  // Inject x-inertia-modal-key into every Inertia request while the modal is
  // open. This ensures partial reloads (e.g. country → states cascade) reuse the
  // same key, preventing React from unmounting and remounting the modal component
  // (which would wipe all uncontrolled form state).
  useEffect(() => {
    if (!modal?.key) return

    return router.on('before', (event) => {
      event.detail.visit.headers['x-inertia-modal-key'] = modal.key
    })
  }, [modal?.key])

  if (!Component || !modal) {
    return null
  }

  return <Component key={modal.key} {...modal.props} />
}
