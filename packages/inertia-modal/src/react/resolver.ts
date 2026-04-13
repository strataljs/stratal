// Module-level resolver store — persists across Inertia navigations.
// Set once in app.tsx before createInertiaApp.
let resolveCallback: ((name: string) => unknown) | undefined

export const resolver = {
  set(cb: (name: string) => unknown): void {
    resolveCallback = cb
  },
  resolve(name: string): unknown {
    if (!resolveCallback) {
      throw new Error(
        '[@stratal/inertia-modal] Resolver not registered. '
        + 'Call resolver.set() before createInertiaApp().',
      )
    }
    return resolveCallback(name)
  },
}
