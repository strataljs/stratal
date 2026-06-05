export const modalMessages = {
  en: {
    errors: {
      backgroundFetchFailed: 'Failed to load background page for modal',
    },
  },
} as const

declare module 'stratal/i18n' {
  interface AppMessageNamespaces {
    modal: typeof modalMessages['en']
  }
}
