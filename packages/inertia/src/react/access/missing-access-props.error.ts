/**
 * Thrown when a component or hook from `@stratal/inertia/react/access` runs on
 * a page with no `access` prop.
 *
 * This is always a wiring problem, never a permission problem — a user with no
 * permissions gets `{ roles: [], permissions: {} }`. Failing loudly keeps
 * "misconfigured" from being indistinguishable from "denied", which would fail
 * open the moment the middleware stopped running.
 */
export class MissingAccessPropsError extends Error {
  constructor() {
    super(
      'The `access` page prop is missing. Configure `accessControl` on '
      + 'AuthModule.forRootAsync() — @stratal/framework shares it automatically '
      + 'on every Inertia render once access control is enabled.',
    )
    this.name = 'MissingAccessPropsError'
  }
}
