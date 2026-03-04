import { type Constructor } from 'stratal'
import { type DynamicModule, getModuleOptions, isModuleClass } from 'stratal/module'
import { Seeder } from './seeder.js'
import type { SeederMap } from './types.js'

/**
 * Collect all seeders from the module tree.
 *
 * Traverses the module tree starting from the root module,
 * checking each provider for classes that extend `Seeder`.
 */
export function collectSeeders(rootModule: Constructor): SeederMap {
  const seeders: SeederMap = {}
  const visited = new Set<unknown>()

  walkModule(rootModule, seeders, visited)

  return seeders
}

function walkModule(
  moduleOrDynamic: unknown,
  seeders: SeederMap,
  visited: Set<unknown>
): void {
  if (visited.has(moduleOrDynamic)) {
    return
  }
  visited.add(moduleOrDynamic)

  // Handle DynamicModule objects (from forRoot/forRootAsync)
  if (typeof moduleOrDynamic === 'object' && moduleOrDynamic !== null && 'module' in moduleOrDynamic) {
    const dynamicModule = moduleOrDynamic as DynamicModule

    // Check providers in the dynamic module
    if (dynamicModule.providers) {
      collectFromProviders(dynamicModule.providers, seeders)
    }

    // Walk the actual module class (it may have its own @Module metadata)
    walkModule(dynamicModule.module, seeders, visited)
    return
  }

  // Handle static @Module classes
  if (!isModuleClass(moduleOrDynamic)) {
    return
  }

  const options = getModuleOptions(moduleOrDynamic)
  if (!options) {
    return
  }

  // Check providers
  if (options.providers) {
    collectFromProviders(options.providers, seeders)
  }

  // Recursively walk imports
  if (options.imports) {
    for (const imported of options.imports) {
      walkModule(imported, seeders, visited)
    }
  }
}

function collectFromProviders(providers: unknown[], seeders: SeederMap): void {
  for (const provider of providers) {
    // Only handle bare class providers (not value/factory/existing providers)
    if (typeof provider !== 'function') {
      continue
    }

    const cls = provider as Constructor<Seeder>
    if (isSeederClass(cls)) {
      const name = deriveSeederName(cls.name)
      seeders[name] = cls
    }
  }
}

function isSeederClass(cls: Constructor): boolean {
  try {
    return cls.prototype instanceof Seeder
  } catch {
    return false
  }
}

/**
 * Derive seeder name from class name.
 *
 * `UserSeeder` -> `user`
 * `RolePermissionsSeeder` -> `role-permissions`
 * `MyService` -> `my-service` (no Seeder suffix to strip)
 */
function deriveSeederName(className: string): string {
  // Strip "Seeder" suffix
  const base = className.endsWith('Seeder')
    ? className.slice(0, -'Seeder'.length)
    : className

  // PascalCase to kebab-case
  return base
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}
