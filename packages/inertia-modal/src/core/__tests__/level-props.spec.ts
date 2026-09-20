import { describe, expect, it } from 'vitest'

import { anchorPropMetadata, levelAskFor } from '../level-props'

describe('anchorPropMetadata', () => {
  it('anchors a scroll prop at the modal path, so the client watches a live path', () => {
    // Inertia builds `only: ['items']` at the page root. A level's props are nested, so unanchored
    // metadata points at a path that never changes and infinite scroll silently stops.
    const anchored = anchorPropMetadata({ scrollProps: { items: { pageName: 'page' } } })
    expect(anchored.scrollProps).toEqual({ 'modal.props.items': { pageName: 'page' } })
  })

  it('anchors every array-shaped metadata key', () => {
    const anchored = anchorPropMetadata({
      mergeProps: ['comments'],
      prependProps: ['alerts'],
      deepMergeProps: ['filters'],
      matchPropsOn: ['comments.id'],
    })
    expect(anchored.mergeProps).toEqual(['modal.props.comments'])
    expect(anchored.prependProps).toEqual(['modal.props.alerts'])
    expect(anchored.deepMergeProps).toEqual(['modal.props.filters'])
    expect(anchored.matchPropsOn).toEqual(['modal.props.comments.id'])
  })

  it('anchors deferred props inside their group', () => {
    const anchored = anchorPropMetadata({ deferredProps: { default: ['stats'] } })
    expect(anchored.deferredProps).toEqual({ default: ['modal.props.stats'] })
  })

  it('anchors the prop a once entry names, as well as the key it sits under', () => {
    // A once entry is read as a path on both sides. Anchoring only the key leaves the entry
    // pointing at the page root, and the prop is re-sent on every visit instead of once.
    const anchored = anchorPropMetadata({ onceProps: { banner: { prop: 'banner', expiresAt: null } } })
    expect(anchored.onceProps).toEqual({
      'modal.props.banner': { prop: 'modal.props.banner', expiresAt: null },
    })
  })

  it('leaves a page object with no metadata alone', () => {
    expect(anchorPropMetadata({ component: 'Parent/Edit' })).toEqual({ component: 'Parent/Edit' })
  })
})

describe('levelAskFor', () => {
  it('names the level props a partial request asks for', () => {
    expect(levelAskFor('modal.props.items')).toEqual({ kind: 'props', names: ['items'] })
  })

  it('asks for the whole level when the level itself is named', () => {
    // What `<ModalLink>` and `useModal().visit()` send: the level, not anything inside it.
    expect(levelAskFor('modal')).toEqual({ kind: 'whole' })
  })

  it('asks for the whole level when the level is named alongside props inside it', () => {
    // The wider of the two requests is the one to honour.
    expect(levelAskFor('modal,modal.props.items')).toEqual({ kind: 'whole' })
  })

  it('asks for the whole level when the request carries no partial data', () => {
    expect(levelAskFor(null)).toEqual({ kind: 'whole' })
    expect(levelAskFor('  ')).toEqual({ kind: 'whole' })
  })

  it('leaves the level unchanged when the request names no modal path at all', () => {
    // A reload for a PAGE prop is not addressed to the level, and what the client holds of it is
    // still current. Re-resolving it would leave its `defer()` props unresolved and advertise them
    // again, which the client answers by fetching them again.
    expect(levelAskFor('unreadCount')).toEqual({ kind: 'unchanged' })
  })

  it('ignores page props sitting alongside a modal path', () => {
    expect(levelAskFor('unreadCount,modal.props.items')).toEqual({ kind: 'props', names: ['items'] })
  })
})
