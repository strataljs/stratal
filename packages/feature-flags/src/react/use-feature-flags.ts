import type { PageProps } from '@inertiajs/core'
import { usePage } from '@inertiajs/react'
import type { FeatureFlagRegistry } from '../types'

interface FeatureFlagsPageProps extends PageProps {
  featureFlags?: Record<string, unknown>
}

/**
 * Returns the full map of feature flags shared by `FeatureFlagInertiaModule`.
 */
export function useFeatureFlags(): Record<string, unknown> {
  return usePage<FeatureFlagsPageProps>().props.featureFlags ?? {}
}

/**
 * Returns a single shared feature flag value.
 *
 * When you augment {@link FeatureFlagRegistry}, the key and return type are
 * checked against your declared flags. Otherwise pass an explicit default.
 *
 * @example
 * ```tsx
 * const showNewCheckout = useFlag('new-checkout')        // typed via FeatureFlagRegistry
 * const layout = useFlag('layout', 'v1')                 // loose fallback
 * ```
 */
export function useFlag<K extends keyof FeatureFlagRegistry>(key: K): FeatureFlagRegistry[K]
export function useFlag<T>(key: string, defaultValue: T): T
export function useFlag(key: string, defaultValue?: unknown): unknown {
  const flags = useFeatureFlags()
  return key in flags ? flags[key] : defaultValue
}
