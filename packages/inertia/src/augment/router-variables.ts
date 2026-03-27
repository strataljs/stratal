declare module 'stratal/router' {
  interface RouterVariables {
    inertia: boolean
    inertiaPrefetch: boolean
    precognition: boolean
    withoutSsr: boolean
    inertiaFlash: Record<string, unknown>
    inertiaFlashOut: Record<string, unknown>
  }
}

export {}
