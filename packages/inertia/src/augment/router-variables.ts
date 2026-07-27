import type { InertiaCacheSignals } from '../services/inertia-cache-signals'

declare module 'stratal/router' {
  interface RouterVariables {
    inertia: boolean
    inertiaPrefetch: boolean
    precognition: boolean
    inertiaFlash: Record<string, unknown>
    inertiaFlashOut: Record<string, unknown>
    /**
     * Conditions that make the just-rendered Inertia page unsafe to cache,
     * set by `InertiaService.render()`. Consumed by core's
     * `CacheabilityService` to fail a `@Cacheable` response closed.
     */
    inertiaCacheSignals?: InertiaCacheSignals
  }
}

export {}
