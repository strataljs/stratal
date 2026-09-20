export const MODAL_TOKENS = {
  ModalService: Symbol.for('stratal:inertia-modal:service'),
  /**
   * How the page beneath a modal is fetched on a document request. Override it to dispatch through
   * something other than the app in process.
   */
  BackgroundDispatcher: Symbol.for('stratal:inertia-modal:background-dispatcher'),
} as const
