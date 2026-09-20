// Ending a level's scroll subscription at the moment it is dismissed.
//
// `<InfiniteScroll>` subscribes to Inertia's `success` event and, when it fires, reads its own
// scroll prop off the page. Inside a level that prop is `modal.props.<name>`, and it exists only
// while the level does — so the response that dismisses the level answers with a page that does not
// carry it, and the subscription throws looking for it.
//
// Inertia's own guard cannot prevent that here. It compares the page component it mounted against
// the one that just arrived, and a level's grafted page reports the component of the page BENEATH
// it — which is exactly the page a dismissal lands on, so the two match and the read goes ahead.
//
// Unmounting cannot prevent it either: the page is replaced, `success` fires, and only then does
// React render. The subscription has to be gone before the visit resolves, which is why this is
// driven from the dismissal rather than from a component lifecycle.

type Teardown = () => void

const byLevel = new Map<string, Set<Teardown>>()

/**
 * Register `teardown` to run when the level at `url` is dismissed.
 *
 * Returns the unsubscribe, for the ordinary unmount path.
 */
export function onLevelDismissed(url: string, teardown: Teardown): Teardown {
  const existing = byLevel.get(url) ?? new Set<Teardown>()
  existing.add(teardown)
  byLevel.set(url, existing)

  return () => {
    const current = byLevel.get(url)
    if (current === undefined) return
    current.delete(teardown)
    if (current.size === 0) byLevel.delete(url)
  }
}

/**
 * Run every teardown registered for these levels, and forget them.
 *
 * Scoped to the levels actually being dismissed: closing a level above another must not end the
 * subscriptions of the one it was covering, which stays open and keeps the rows it had loaded.
 */
export function dismissLevels(urls: readonly string[]): void {
  for (const url of urls) {
    const teardowns = byLevel.get(url)
    if (teardowns === undefined) continue

    byLevel.delete(url)
    for (const teardown of teardowns) teardown()
  }
}
