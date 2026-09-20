import { createContext } from 'react'
import type { ModalData } from '../core/wire'

export interface ModalLevel {
  modal: ModalData
  depth: number
  isTop: boolean
}

/** Every open level, outermost first. */
export const ModalStackContext = createContext<ModalData[]>([])

/** The level the component reading it is rendered in. */
export const ModalLevelContext = createContext<ModalLevel | null>(null)
