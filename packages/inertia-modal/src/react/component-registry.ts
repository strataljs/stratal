import type { ComponentType } from 'react'

export type ModalComponent = ComponentType<Record<string, unknown>>

/**
 * The modal components resolved so far, by page-component name.
 *
 * Module-level, and safe on a server: it maps build-time names to build-time components, so nothing
 * request-scoped enters it and a render only ever reads the names its own payload carries.
 */
let components: Record<string, ModalComponent> = {}

export function rememberModalComponents(resolved: Record<string, ModalComponent>): void {
  Object.assign(components, resolved)
}

export function readModalComponents(): Record<string, ModalComponent> {
  return components
}

export function clearModalComponents(): void {
  components = {}
}
