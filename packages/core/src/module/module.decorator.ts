/**
 * Module Decorator
 *
 * NestJS-style @Module decorator for defining modules with providers, controllers, etc.
 * Encapsulates tsyringe's @registry decorator for auto-registration.
 */

import type { DependencyContainer, Provider as TsyringeProvider } from 'tsyringe'
import { instancePerContainerCachingFactory, type Lifecycle, registry } from 'tsyringe'
import type InjectionToken from 'tsyringe/dist/typings/providers/injection-token'
import type RegistrationOptions from 'tsyringe/dist/typings/types/registration-options'
import type { Constructor } from '../types'
import { InvalidModuleProviderError } from './errors'
import type { ModuleOptions, Provider } from './types'

export const MODULE_OPTIONS_KEY = Symbol('module:options')

/**
 * Tsyringe registry entry format
 */
type RegistryEntry = {
  token: InjectionToken
  options?: RegistrationOptions
} & TsyringeProvider

/**
 * `@Module` decorator - defines a module with imports, providers, controllers, consumers, jobs
 *
 * Uses tsyringe's `@registry` internally to auto-register providers when module is imported.
 *
 * @example
 * ```typescript
 * @Module({
 *   imports: [OtherModule],
 *   providers: [MyService, MyRepository],
 *   controllers: [MyController],
 * })
 * export class MyModule {}
 * ```
 */
export function Module(options: ModuleOptions) {
  return <TFunction extends abstract new (...args: never[]) => unknown>(target: TFunction): TFunction => {
    // Store module options for runtime access
    Reflect.defineMetadata(MODULE_OPTIONS_KEY, options, target)

    // Build tsyringe registry entries from providers
    const registryEntries = buildRegistryEntries(options.providers ?? [])

    // Apply tsyringe @registry decorator (encapsulated)
    if (registryEntries.length > 0) {
      registry(registryEntries)(target)
    }

    return target
  }
}

/**
 * Get module options from decorated class
 */
export function getModuleOptions(target: Constructor): ModuleOptions | undefined {
  return Reflect.getMetadata(MODULE_OPTIONS_KEY, target) as ModuleOptions | undefined
}

/**
 * Check if a class is decorated with `@Module`
 */
export function isModuleClass(target: unknown): target is Constructor {
  return (
    typeof target === 'function' &&
    Reflect.hasMetadata(MODULE_OPTIONS_KEY, target)
  )
}

/**
 * Convert our Provider types to tsyringe registry format
 *
 * Maps provider scope to tsyringe's lifecycle option.
 * Scope enum values map directly to Lifecycle enum values.
 */
function buildRegistryEntries(providers: Provider[]): RegistryEntry[] {
  return providers.map((provider): RegistryEntry => {
    // Class-only provider - transient by default
    if (typeof provider === 'function') {
      return {
        token: provider as InjectionToken,
        useClass: provider,
      }
    }

    // ClassProvider with optional scope
    if ('useClass' in provider) {
      return {
        token: provider.provide as InjectionToken,
        useClass: provider.useClass,
        options: provider.scope !== undefined
          ? { lifecycle: provider.scope as unknown as Lifecycle }
          : undefined,
      }
    }

    // ValueProvider - no scope needed (values are inherently singleton)
    if ('useValue' in provider) {
      return {
        token: provider.provide as InjectionToken,
        useValue: provider.useValue,
      }
    }

    // FactoryProvider - use instancePerContainerCachingFactory to:
    // 1. Get the actual container at resolution time (global vs request)
    // 2. Cache result per container
    if ('useFactory' in provider) {
      const { provide, useFactory, inject = [] } = provider
      return {
        token: provide as InjectionToken,
        useFactory: instancePerContainerCachingFactory((dependencyContainer: DependencyContainer): object => {
          const deps = inject.map((token) => dependencyContainer.resolve(token))
          return useFactory(...deps) as object
        }),
      }
    }

    // ExistingProvider - alias to another token (uses tsyringe's useToken)
    if ('useExisting' in provider) {
      return {
        token: provider.provide as InjectionToken,
        useToken: provider.useExisting as InjectionToken,
      }
    }

    // Fallback (should not reach here with proper types)
    throw new InvalidModuleProviderError(provider)
  })
}
