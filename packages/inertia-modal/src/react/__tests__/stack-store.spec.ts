import { beforeEach, describe, expect, it } from 'vitest'
import type { ModalData } from '../../core/wire'
import { clearHeldStack, holdStack, readHeldStack } from '../stack-store'

const level: ModalData = {
  component: 'Parent/Edit', props: {}, url: '/parent/1/edit', base: '/parent', close: '/parent',
}

describe('stack store', () => {
  beforeEach(() => { clearHeldStack() })

  it('starts empty', () => {
    expect(readHeldStack()).toEqual([])
  })

  it('clears', () => {
    holdStack([level])
    clearHeldStack()
    expect(readHeldStack()).toEqual([])
  })
})
