import type { UserConfig } from 'tsdown'

type ExportsMap = Record<string, Record<string, unknown> | string>

/**
 * Converts plain string exports (`.mjs`) to conditional `{ types, import }` objects.
 * Needed because tsdown's `genSubExport` for ESM-only packages produces plain strings
 * and skips DTS files from the export map.
 */
export function withTypesExports(exports: ExportsMap): ExportsMap {
  for (const [key, value] of Object.entries(exports)) {
    if (typeof value === 'string' && value.endsWith('.mjs')) {
      exports[key] = {
        types: value.replace('.mjs', '.d.mts'),
        import: value,
      }
    }
  }
  return exports
}

export const baseConfig = {
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  fixedExtension: true,
} satisfies Partial<UserConfig>
