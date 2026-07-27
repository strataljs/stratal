import { describe, expect, expectTypeOf, it } from 'vitest'
import { evaluate, matchesPermission, matchesRole } from '../react/access/match'
import type { SharedAccess } from '../access/types'
import { createElement, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, vi } from 'vitest'
import type { CanProps, RoleProps } from '../react/access/components'

declare module '../access/types' {
  interface AccessControlRegistry {
    permissions:
      | 'posts' | 'posts:*' | 'posts:create' | 'posts:read' | 'posts:update' | 'posts:delete'
      | 'comments' | 'comments:*' | 'comments:read'
      | 'admin' | 'admin:*' | 'admin:access'
    roles: 'admin' | 'editor' | 'reviewer'
  }
}

const EDITOR: SharedAccess = {
  roles: ['editor', 'reviewer'],
  permissions: { posts: ['create', 'read', 'update'], comments: ['read'] },
}

const GUEST: SharedAccess = { roles: [], permissions: {} }

describe('matchesPermission', () => {
  it('matches an exact resource:action', () => {
    expect(matchesPermission(EDITOR, 'posts:update')).toBe(true)
    expect(matchesPermission(EDITOR, 'posts:delete')).toBe(false)
  })

  it('treats a bare resource as any action on it', () => {
    expect(matchesPermission(EDITOR, 'posts')).toBe(true)
    expect(matchesPermission(EDITOR, 'admin')).toBe(false)
  })

  it('treats resource:* as any action on it, for AuthGuard parity', () => {
    expect(matchesPermission(EDITOR, 'posts:*')).toBe(true)
    expect(matchesPermission(EDITOR, 'admin:*')).toBe(false)
  })

  it('denies a resource present but with no actions', () => {
    expect(matchesPermission({ roles: [], permissions: { posts: [] } }, 'posts')).toBe(false)
  })

  it('denies everything for a guest', () => {
    expect(matchesPermission(GUEST, 'posts:read')).toBe(false)
    expect(matchesPermission(GUEST, 'posts')).toBe(false)
  })

  it('splits on the first colon only, treating the rest as the action', () => {
    const access: SharedAccess = { roles: [], permissions: { posts: ['read:own'] } }
    expect(matchesPermission(access, 'posts:read:own')).toBe(true)
    expect(matchesPermission({ roles: [], permissions: { posts: ['read'] } }, 'posts:read:own')).toBe(false)
  })

  it('is case-sensitive on both resource and action', () => {
    expect(matchesPermission({ roles: [], permissions: { posts: ['read'] } }, 'posts:READ')).toBe(false)
    expect(matchesPermission({ roles: [], permissions: { posts: ['read'] } }, 'POSTS:read')).toBe(false)
  })
})

describe('matchesRole', () => {
  it('matches a held role', () => {
    expect(matchesRole(EDITOR, 'editor')).toBe(true)
    expect(matchesRole(EDITOR, 'admin')).toBe(false)
  })

  it('denies everything for a guest', () => {
    expect(matchesRole(GUEST, 'editor')).toBe(false)
  })
})

describe('evaluate', () => {
  it('resolves a single value', () => {
    expect(evaluate(EDITOR, 'posts:update', matchesPermission)).toBe(true)
    expect(evaluate(EDITOR, 'posts:delete', matchesPermission)).toBe(false)
  })

  it('resolves `any` as OR', () => {
    expect(evaluate(EDITOR, { any: ['posts:delete', 'posts:update'] }, matchesPermission)).toBe(true)
    expect(evaluate(EDITOR, { any: ['posts:delete', 'admin:access'] }, matchesPermission)).toBe(false)
  })

  it('resolves `all` as AND', () => {
    expect(evaluate(EDITOR, { all: ['posts:read', 'comments:read'] }, matchesPermission)).toBe(true)
    expect(evaluate(EDITOR, { all: ['posts:read', 'posts:delete'] }, matchesPermission)).toBe(false)
  })

  it('resolves empty `any` as false and empty `all` as true', () => {
    expect(evaluate(EDITOR, { any: [] }, matchesPermission)).toBe(false)
    expect(evaluate(EDITOR, { all: [] }, matchesPermission)).toBe(true)
  })
})

let currentProps: Record<string, unknown> = {}

vi.mock('@inertiajs/react', () => ({
  usePage: () => ({ props: currentProps }),
}))

const { useAccess, useCan, useRole } = await import('../react/access/use-access')
const { MissingAccessPropsError } = await import('../react/access/missing-access-props.error')

/** Renders a hook inside a throwaway component and returns what it produced. */
function renderHook<T>(hook: () => T): T {
  let captured: T
  const Probe = (): null => {
    captured = hook()
    return null
  }
  renderToStaticMarkup(createElement(Probe))
  return captured!
}

beforeEach(() => {
  currentProps = { access: EDITOR }
})

describe('useAccess', () => {
  it('returns the shared access prop', () => {
    expect(renderHook(() => useAccess())).toEqual(EDITOR)
  })

  it('throws when the access prop is missing', () => {
    currentProps = {}
    expect(() => renderHook(() => useAccess())).toThrow(MissingAccessPropsError)
  })
})

describe('useCan', () => {
  it('resolves single, any, and all checks', () => {
    expect(renderHook(() => useCan('posts:update'))).toBe(true)
    expect(renderHook(() => useCan('posts:delete'))).toBe(false)
    expect(renderHook(() => useCan({ any: ['posts:delete', 'posts:update'] }))).toBe(true)
    expect(renderHook(() => useCan({ all: ['posts:read', 'posts:delete'] }))).toBe(false)
  })

  it('denies everything for a guest', () => {
    currentProps = { access: GUEST }
    expect(renderHook(() => useCan('posts:read'))).toBe(false)
  })

  it('throws when the access prop is missing', () => {
    currentProps = {}
    expect(() => renderHook(() => useCan('posts:read'))).toThrow(MissingAccessPropsError)
  })
})

describe('useRole', () => {
  it('resolves single, any, and all checks', () => {
    expect(renderHook(() => useRole('editor'))).toBe(true)
    expect(renderHook(() => useRole('admin'))).toBe(false)
    expect(renderHook(() => useRole({ any: ['admin', 'editor'] }))).toBe(true)
    expect(renderHook(() => useRole({ all: ['editor', 'reviewer'] }))).toBe(true)
    expect(renderHook(() => useRole({ all: ['editor', 'admin'] }))).toBe(false)
  })

  it('throws when the access prop is missing', () => {
    currentProps = {}
    expect(() => renderHook(() => useRole('editor'))).toThrow(MissingAccessPropsError)
  })
})

const { Can, Cannot, HasNoRole, HasRole } = await import('../react/access/components')

/**
 * Renders a gate component and returns its markup ('' when it renders nothing).
 *
 * Generic over the component's own prop type rather than
 * `Parameters<typeof createElement>[0]`: `createElement`'s overloads collapse
 * an unapplied `P` to its `{}` constraint, which would reject every gate
 * component here since their props are all required.
 */
function renderGate<P extends object>(component: FunctionComponent<P>, props: P): string {
  return renderToStaticMarkup(createElement(component, props, 'shown'))
}

describe('Can', () => {
  it('renders children when the permission is held', () => {
    expect(renderGate(Can, { do: 'posts:update' })).toBe('shown')
  })

  it('renders nothing when it is not', () => {
    expect(renderGate(Can, { do: 'posts:delete' })).toBe('')
  })

  it('supports any and all', () => {
    expect(renderGate(Can, { any: ['posts:delete', 'posts:update'] })).toBe('shown')
    expect(renderGate(Can, { all: ['posts:read', 'comments:read'] })).toBe('shown')
    expect(renderGate(Can, { all: ['posts:read', 'posts:delete'] })).toBe('')
  })

  it('supports the bare-resource and :* wildcards', () => {
    expect(renderGate(Can, { do: 'posts' })).toBe('shown')
    expect(renderGate(Can, { do: 'posts:*' })).toBe('shown')
    expect(renderGate(Can, { do: 'admin' })).toBe('')
  })

  it('renders nothing for a guest', () => {
    currentProps = { access: GUEST }
    expect(renderGate(Can, { do: 'posts:read' })).toBe('')
  })

  it('throws when the access prop is missing', () => {
    currentProps = {}
    expect(() => renderGate(Can, { do: 'posts:read' })).toThrow(MissingAccessPropsError)
  })

  it('falls through to `do` when `any` is present but explicitly `undefined`', () => {
    // `GateProps` types the off-branches as `any?: never`, which type-checks an
    // explicit `any: undefined` (e.g. from `{ ...(cond ? { any: list } : { any: undefined }) }`).
    // `toCheck` must not treat that as "the `any` branch was chosen".
    const props = { do: 'posts:update', any: undefined } as unknown as CanProps
    expect(renderGate(Can, props)).toBe('shown')
  })
})

describe('Cannot', () => {
  it('inverts Can', () => {
    expect(renderGate(Cannot, { do: 'posts:delete' })).toBe('shown')
    expect(renderGate(Cannot, { do: 'posts:update' })).toBe('')
    expect(renderGate(Cannot, { any: ['posts:delete', 'posts:update'] })).toBe('')
  })
})

describe('HasRole', () => {
  it('renders children when the role is held', () => {
    expect(renderGate(HasRole, { is: 'editor' })).toBe('shown')
    expect(renderGate(HasRole, { is: 'admin' })).toBe('')
  })

  it('supports any and all', () => {
    expect(renderGate(HasRole, { any: ['admin', 'editor'] })).toBe('shown')
    expect(renderGate(HasRole, { all: ['editor', 'reviewer'] })).toBe('shown')
    expect(renderGate(HasRole, { all: ['editor', 'admin'] })).toBe('')
  })
})

describe('HasNoRole', () => {
  it('inverts HasRole', () => {
    expect(renderGate(HasNoRole, { is: 'admin' })).toBe('shown')
    expect(renderGate(HasNoRole, { is: 'editor' })).toBe('')
  })
})

describe('gate props', () => {
  it('accepts exactly one form', () => {
    expectTypeOf<{ do: 'posts:read' }>().toMatchTypeOf<Omit<CanProps, 'children'>>()
    expectTypeOf<{ any: readonly ['posts:read'] }>().toMatchTypeOf<Omit<CanProps, 'children'>>()
  })

  // A `not.toMatchTypeOf` assertion here can't prove exclusivity: whichever
  // branch of `CanProps` a combined-form target is checked against, that
  // branch already lacks the *other* form's key entirely (it's not just
  // narrowed to `never`), so the union fails to match regardless of whether
  // the `never` markers in `GateProps` exist. Assigning a literal that
  // combines two forms is the check that actually depends on those markers.
  it('rejects an object literal that combines `do` and `any`', () => {
    // @ts-expect-error - combining `do` and `any` must be a compile error
    const invalid: CanProps = { do: 'posts:read', any: ['posts:read'] }
    expect(invalid).toBeDefined()
  })

  it('rejects an object literal that combines `do` and `all`', () => {
    // @ts-expect-error - combining `do` and `all` must be a compile error
    const invalid: CanProps = { do: 'posts:read', all: ['posts:read'] }
    expect(invalid).toBeDefined()
  })

  it('rejects an object literal that combines `any` and `all`', () => {
    // @ts-expect-error - combining `any` and `all` must be a compile error
    const invalid: CanProps = { any: ['posts:read'], all: ['posts:read'] }
    expect(invalid).toBeDefined()
  })

  it('rejects an object literal that combines `is` and `any`', () => {
    // @ts-expect-error - combining `is` and `any` must be a compile error
    const invalid: RoleProps = { is: 'editor', any: ['editor'] }
    expect(invalid).toBeDefined()
  })

  it('rejects an object literal that combines `is` and `all`', () => {
    // @ts-expect-error - combining `is` and `all` must be a compile error
    const invalid: RoleProps = { is: 'editor', all: ['editor'] }
    expect(invalid).toBeDefined()
  })

  it('rejects an object literal that combines `any` and `all` on RoleProps', () => {
    // @ts-expect-error - combining `any` and `all` must be a compile error
    const invalid: RoleProps = { any: ['editor'], all: ['editor'] }
    expect(invalid).toBeDefined()
  })
})
