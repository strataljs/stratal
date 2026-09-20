import { describe, expect, it } from 'vitest'

import type { ModalData } from '../../core/wire'
import { readModalComponents, rememberModalComponents } from '../component-registry'
import { resetModalState } from '../reset'
import { holdStack, readHeldStack } from '../stack-store'

const level: ModalData = {
  component: 'Parent/Edit',
  props: { title: 'Edit' },
  url: '/parent/1/edit',
  base: '/parent',
  close: '/parent',
}

describe('resetModalState', () => {
  it('empties the open stack', () => {
    holdStack([level])

    resetModalState()

    expect(readHeldStack()).toEqual([])
  })

  it('empties the resolved components', () => {
    rememberModalComponents({ 'Parent/Edit': () => null })

    resetModalState()

    expect(readModalComponents()).toEqual({})
  })
})
