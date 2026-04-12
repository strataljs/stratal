import { router, usePage } from '@inertiajs/react'
import { useCallback } from 'react'
import { type ModalData } from '../services/modal.service'


interface UseModalReturn {
  /** Whether a modal is currently active on this page. */
  show: boolean
  /** Navigate back to the page that opened the modal (or the base URL on direct visits). */
  redirect(): void
  /** The modal component's props, if a modal is active. */
  props: Record<string, unknown> | undefined
}

export function useModal(): UseModalReturn {
  const page = usePage()
  const modal = page.props.modal as ModalData

  const redirect = useCallback(() => {
    if (!modal) return
    router.visit(modal.redirectURL ?? modal.baseURL, {
      preserveScroll: true,
      preserveState: true,
    })
  }, [modal])

  return {
    show: !!modal,
    redirect,
    props: modal?.props,
  }
}
