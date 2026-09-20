import { describe, expect, it } from 'vitest'

import { dismissLevels, onLevelDismissed } from '../scroll-teardown'

describe('scroll teardown', () => {
  it('runs what a dismissed level registered', () => {
    const ran: string[] = []
    onLevelDismissed('/parent/1/edit', () => ran.push('edit'))

    dismissLevels(['/parent/1/edit'])

    expect(ran).toEqual(['edit'])
  })

  it('leaves a level that is not being dismissed alone', () => {
    // Closing a level above another must not end the one it was covering: that level stays open,
    // and its list keeps the rows it had already loaded.
    const ran: string[] = []
    onLevelDismissed('/parent/1/edit', () => ran.push('edit'))
    onLevelDismissed('/parent/1/child/2', () => ran.push('child'))

    dismissLevels(['/parent/1/child/2'])

    expect(ran).toEqual(['child'])
  })

  it('runs every registration a level made', () => {
    const ran: string[] = []
    onLevelDismissed('/parent/1/edit', () => ran.push('first'))
    onLevelDismissed('/parent/1/edit', () => ran.push('second'))

    dismissLevels(['/parent/1/edit'])

    expect(ran).toEqual(['first', 'second'])
  })

  it('forgets a registration that unsubscribed', () => {
    const ran: string[] = []
    const stop = onLevelDismissed('/parent/1/edit', () => ran.push('edit'))

    stop()
    dismissLevels(['/parent/1/edit'])

    expect(ran).toEqual([])
  })

  it('does not run a level twice', () => {
    const ran: string[] = []
    onLevelDismissed('/parent/1/edit', () => ran.push('edit'))

    dismissLevels(['/parent/1/edit'])
    dismissLevels(['/parent/1/edit'])

    expect(ran).toEqual(['edit'])
  })
})
