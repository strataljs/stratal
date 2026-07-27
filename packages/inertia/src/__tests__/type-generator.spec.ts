import { fileURLToPath } from 'node:url'
import { Project, SyntaxKind, ts } from 'ts-morph'
import { describe, expect, it } from 'vitest'
import { detectI18nConfig, extractAccessControlType, extractControllerPageTypes, extractFlashTypes, extractShareCallTypes, generateInertiaTypes, primeTranslationKeys, seedInertiaI18nAugmentation } from '../generator/type-generator'

// `packages/inertia/src/__tests__/` -> `packages/framework/src/access-control/`
const FRAMEWORK_ACCESS_CONTROL_DIR = fileURLToPath(
  new URL('../../../framework/src/access-control', import.meta.url),
)

const FIXTURE_HEADER = `
export interface InertiaDeferredProp<T = unknown> {
  callback: () => T
  group: string
}

export interface InertiaContext {
  inertia: <P>(component: string, props: P) => unknown
  defer: <T>(cb: () => T, group?: string) => InertiaDeferredProp<T>
}
`

/**
 * Build an in-memory ts-morph project + run the generator against a controller
 * whose deferred callback returns the given type. Returns the inlined props
 * type string emitted for the page.
 */
function generatePropsType(deferredReturnTypeDecl: string, deferredCall: string): string {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
    },
  })

  project.createSourceFile(
    '/src/notes.controller.ts',
    `
${FIXTURE_HEADER}

${deferredReturnTypeDecl}

declare const ctx: InertiaContext

export class NotesController {
  index() {
    return ctx.inertia('notes/Index', {
      items: ${deferredCall},
    })
  }
}
`,
  )

  const pages = extractControllerPageTypes(
    project,
    SyntaxKind,
    ts,
    '/src',
    '/src/inertia/pages',
  )

  const note = pages.find((p) => p.componentName === 'notes/Index')
  if (!note) throw new Error('expected notes/Index page to be extracted')
  return note.propsType
}

describe('extractControllerPageTypes', () => {
  it('unwraps a vanilla Promise return from a deferred callback', () => {
    const propsType = generatePropsType(
      `declare function fetchItems(): Promise<Array<{ id: string; title: string }>>`,
      `ctx.defer(() => fetchItems())`,
    )

    expect(propsType).toContain('items:')
    expect(propsType).toMatch(/items: Array<\{ id: string; title: string;? \}>/)
    expect(propsType).not.toContain('Promise<')
    expect(propsType).not.toContain('then:')
  })

  it('preserves an InertiaTranslationKeys-typed prop as a reference instead of inlining the key union', () => {
    // Reaching `InertiaTranslationKeys` through a deferred callback + nested object
    // drops its type alias, so the generator falls back to structural identity
    // against the project's resolved key set. The prop must stay a reference, never
    // the inlined union (which would also leak the non-`ui` `core.back` key). The
    // narrow `titleKey` union proves a hand-picked subset is NOT mistaken for the
    // full key type. `@stratal/inertia` is provided as a resolvable module so the
    // generator's probe resolves it exactly as it does against the installed package.
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
      },
    })

    project.createSourceFile('/node_modules/@stratal/inertia/package.json', JSON.stringify({ name: '@stratal/inertia', types: 'index.d.ts' }))
    project.createSourceFile(
      '/node_modules/@stratal/inertia/index.d.ts',
      `
export type DeepKeys<T, P extends string = ''> = T extends object
  ? { [K in keyof T & string]: T[K] extends object ? DeepKeys<T[K], \`\${P}\${K}.\`> : \`\${P}\${K}\` }[keyof T & string]
  : never
export type Messages = { admin: { ui: { greeting: string; farewell: string } }; core: { back: string } }
export type MessageKeys = DeepKeys<Messages>
export interface InertiaI18nConfig {}
export type InertiaTranslationKeys = InertiaI18nConfig extends { translationKeys: infer T extends string } ? T : MessageKeys
`,
    )

    project.createSourceFile(
      '/src/notes.controller.ts',
      `
${FIXTURE_HEADER}

import type { InertiaTranslationKeys } from '@stratal/inertia'

declare function loadField(): Promise<{
  labelI18nKey: InertiaTranslationKeys
  titleKey: 'admin.ui.greeting'
}>

declare const ctx: InertiaContext

export class NotesController {
  index() {
    return ctx.inertia('notes/Index', {
      items: ctx.defer(() => loadField()),
    })
  }
}
`,
    )

    const pages = extractControllerPageTypes(project, SyntaxKind, ts, '/src', '/src/inertia/pages')
    const note = pages.find((p) => p.componentName === 'notes/Index')
    if (!note) throw new Error('expected notes/Index page to be extracted')
    const propsType = note.propsType

    expect(propsType).toContain("labelI18nKey: import('@stratal/inertia').InertiaTranslationKeys")
    expect(propsType).not.toContain('admin.ui.farewell')
    expect(propsType).not.toContain('core.back')
    // A hand-picked narrow union stays inlined — it is not the full key type.
    expect(propsType).toContain(`titleKey: "admin.ui.greeting"`)
  })

  // Mirrors production: `MessageKeys`/`FilterByPrefix` live in `stratal/i18n`,
  // `@stratal/inertia` re-derives `InertiaTranslationKeys` from the augmentable
  // `InertiaI18nConfig`, and the prefix-filter augmentation lives in the consumer's
  // generated inertia.d.ts (NOT the installed package). Under this shape the key
  // union is a prefix-filtered SUBSET of the full `MessageKeys`.
  function generateFilteredI18nProps(controllerBody: string): string {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
      },
    })

    project.createSourceFile('/node_modules/stratal/package.json', JSON.stringify({ name: 'stratal', exports: { './i18n': './i18n.d.ts' } }))
    project.createSourceFile(
      '/node_modules/stratal/i18n.d.ts',
      `
export type DeepKeys<T, P extends string = ''> = T extends object
  ? { [K in keyof T & string]: T[K] extends object ? DeepKeys<T[K], \`\${P}\${K}.\`> : \`\${P}\${K}\` }[keyof T & string]
  : never
export type Messages = { admin: { ui: { greeting: string; farewell: string } }; core: { back: string } }
export type MessageKeys = DeepKeys<Messages>
export type FilterByPrefix<Keys extends string, Prefix extends string> =
  Keys extends \`\${Prefix}.\${string}\` ? Keys
  : Keys extends Prefix ? Keys
  : never
`,
    )
    project.createSourceFile('/node_modules/@stratal/inertia/package.json', JSON.stringify({ name: '@stratal/inertia', types: 'index.d.ts' }))
    project.createSourceFile(
      '/node_modules/@stratal/inertia/index.d.ts',
      `
import type { MessageKeys } from 'stratal/i18n'
export interface InertiaI18nConfig {}
export type InertiaTranslationKeys = InertiaI18nConfig extends { translationKeys: infer T extends string } ? T : MessageKeys
`,
    )
    // The prefix-filter augmentation, as the generator emits it into the consumer app.
    project.createSourceFile(
      '/src/inertia/inertia.d.ts',
      `
declare module '@stratal/inertia' {
  interface InertiaI18nConfig {
    translationKeys: import('stratal/i18n').FilterByPrefix<import('stratal/i18n').MessageKeys, 'admin.ui'>
  }
}
export {}
`,
    )
    project.createSourceFile(
      '/src/notes.controller.ts',
      `
${FIXTURE_HEADER}

import type { InertiaTranslationKeys } from '@stratal/inertia'
import type { MessageKeys } from 'stratal/i18n'

${controllerBody}

declare const ctx: InertiaContext
`,
    )

    const pages = extractControllerPageTypes(project, SyntaxKind, ts, '/src', '/src/inertia/pages')
    const note = pages.find((p) => p.componentName === 'notes/Index')
    if (!note) throw new Error('expected notes/Index page to be extracted')
    return note.propsType
  }

  // Like generateFilteredI18nProps, but with `keyCount` keys under the filtered
  // `ns.ui` namespace plus `extraFullKeyCount` keys under an unfiltered `other.x`
  // namespace — used to exercise the coverage heuristic (which only applies once a
  // union is large both as a fraction of its set and in absolute terms) and, with a
  // non-zero `extraFullKeyCount`, the case where the filtered set is much smaller
  // than the full set.
  function generateSizedI18nProps(keyCount: number, extraFullKeyCount: number, controllerBody: string): string {
    const keyFields = Array.from({ length: keyCount }, (_, i) => `k${i}: string`).join('; ')
    const extraFields = Array.from({ length: extraFullKeyCount }, (_, i) => `x${i}: string`).join('; ')
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
      },
    })

    project.createSourceFile('/node_modules/stratal/package.json', JSON.stringify({ name: 'stratal', exports: { './i18n': './i18n.d.ts' } }))
    project.createSourceFile(
      '/node_modules/stratal/i18n.d.ts',
      `
export type DeepKeys<T, P extends string = ''> = T extends object
  ? { [K in keyof T & string]: T[K] extends object ? DeepKeys<T[K], \`\${P}\${K}.\`> : \`\${P}\${K}\` }[keyof T & string]
  : never
export type Messages = { ns: { ui: { ${keyFields} } }; other: { x: { ${extraFields} } } }
export type MessageKeys = DeepKeys<Messages>
export type FilterByPrefix<Keys extends string, Prefix extends string> =
  Keys extends \`\${Prefix}.\${string}\` ? Keys
  : Keys extends Prefix ? Keys
  : never
`,
    )
    project.createSourceFile('/node_modules/@stratal/inertia/package.json', JSON.stringify({ name: '@stratal/inertia', types: 'index.d.ts' }))
    project.createSourceFile(
      '/node_modules/@stratal/inertia/index.d.ts',
      `
import type { MessageKeys } from 'stratal/i18n'
export interface InertiaI18nConfig {}
export type InertiaTranslationKeys = InertiaI18nConfig extends { translationKeys: infer T extends string } ? T : MessageKeys
`,
    )
    project.createSourceFile(
      '/src/inertia/inertia.d.ts',
      `
declare module '@stratal/inertia' {
  interface InertiaI18nConfig {
    translationKeys: import('stratal/i18n').FilterByPrefix<import('stratal/i18n').MessageKeys, 'ns.ui'>
  }
}
export {}
`,
    )
    project.createSourceFile(
      '/src/notes.controller.ts',
      `
${FIXTURE_HEADER}

import type { InertiaTranslationKeys } from '@stratal/inertia'

${controllerBody}

declare const ctx: InertiaContext
`,
    )

    const pages = extractControllerPageTypes(project, SyntaxKind, ts, '/src', '/src/inertia/pages')
    const note = pages.find((p) => p.componentName === 'notes/Index')
    if (!note) throw new Error('expected notes/Index page to be extracted')
    return note.propsType
  }

  it('collapses prefix-filtered key props to InertiaTranslationKeys, including nullable unions', () => {
    // Reached through a deferred callback + nested object so the `InertiaTranslationKeys`
    // alias is dropped and detection must fall back to structural identity. The prefix
    // filter makes the union a strict subset of `MessageKeys` (drops `core.back`).
    const propsType = generateFilteredI18nProps(`
declare function loadDetail(): Promise<{
  nameKey: InertiaTranslationKeys
  errorReasonKey: InertiaTranslationKeys | null
}>

export class NotesController {
  index() {
    return ctx.inertia('notes/Index', { detail: ctx.defer(() => loadDetail()) })
  }
}
`)

    expect(propsType).toContain("nameKey: import('@stratal/inertia').InertiaTranslationKeys")
    expect(propsType).toContain("errorReasonKey: null | import('@stratal/inertia').InertiaTranslationKeys")
    // The key literals must never be inlined.
    expect(propsType).not.toContain('admin.ui.greeting')
    expect(propsType).not.toContain('admin.ui.farewell')
  })

  it('collapses a full MessageKeys prop to a MessageKeys reference, not the filtered alias', () => {
    // A prop typed as the full `MessageKeys` is a superset of the filtered set, so it
    // must reference `MessageKeys` (widening it to `InertiaTranslationKeys` would drop
    // `core.back`).
    const propsType = generateFilteredI18nProps(`
declare function loadDetail(): Promise<{ anyKey: MessageKeys }>

export class NotesController {
  index() {
    return ctx.inertia('notes/Index', { detail: ctx.defer(() => loadDetail()) })
  }
}
`)

    expect(propsType).toContain("anyKey: import('stratal/i18n').MessageKeys")
    expect(propsType).not.toContain('admin.ui.greeting')
    expect(propsType).not.toContain('core.back')
  })

  it('collapses a large under-resolved key subset (no recoverable alias) to InertiaTranslationKeys', () => {
    // Simulates a prop whose `InertiaTranslationKeys` type resolved against an
    // incomplete set of message-namespace augmentations: a strict subset of the
    // key space, reached as a bare literal union with no alias. Two keys are
    // dropped from a 50-key set, leaving a 48-key subset that clears both the
    // coverage fraction and the absolute-size floor and must collapse.
    const propsType = generateSizedI18nProps(50, 0, `
declare function loadDetail(): Promise<{ nameKey: Exclude<InertiaTranslationKeys, 'ns.ui.k0' | 'ns.ui.k1'> }>

export class NotesController {
  index() {
    return ctx.inertia('notes/Index', { detail: ctx.defer(() => loadDetail()) })
  }
}
`)

    expect(propsType).toContain("nameKey: import('@stratal/inertia').InertiaTranslationKeys")
    expect(propsType).not.toContain('ns.ui.k2')
  })

  it('collapses an under-resolved subset even when the prefix filter is much smaller than the full key set', () => {
    // 50 filtered keys within a 200-key full set (150 unfiltered). An under-resolved
    // InertiaTranslationKeys prop (45 of the 50 filtered keys) covers 90% of the
    // filtered set but only 22% of the full set — it must be judged against the
    // filtered set (its own set), not the full set, or it stays inlined.
    const propsType = generateSizedI18nProps(50, 150, `
declare function loadDetail(): Promise<{ nameKey: Exclude<InertiaTranslationKeys, 'ns.ui.k0' | 'ns.ui.k1' | 'ns.ui.k2' | 'ns.ui.k3' | 'ns.ui.k4'> }>

export class NotesController {
  index() {
    return ctx.inertia('notes/Index', { detail: ctx.defer(() => loadDetail()) })
  }
}
`)

    expect(propsType).toContain("nameKey: import('@stratal/inertia').InertiaTranslationKeys")
    expect(propsType).not.toContain('ns.ui.k9')
  })

  it('keeps a deliberate narrow enum inlined even when it is a majority of a tiny key set', () => {
    // Regression: with only 4 keys total, a hand-picked two-value enum is already
    // 50% of the set. The absolute-size floor must keep it inlined rather than
    // widening it to InertiaTranslationKeys.
    const propsType = generateSizedI18nProps(4, 0, `
declare function loadDetail(): Promise<{ statusKey: 'ns.ui.k0' | 'ns.ui.k1' }>

export class NotesController {
  index() {
    return ctx.inertia('notes/Index', { detail: ctx.defer(() => loadDetail()) })
  }
}
`)

    expect(propsType).toContain('statusKey: "ns.ui.k0" | "ns.ui.k1"')
    expect(propsType).not.toContain('InertiaTranslationKeys')
  })

  it('leaves a hand-picked narrow subset of keys inlined under a prefix filter', () => {
    const propsType = generateFilteredI18nProps(`
declare function loadDetail(): Promise<{ titleKey: 'admin.ui.greeting' }>

export class NotesController {
  index() {
    return ctx.inertia('notes/Index', { detail: ctx.defer(() => loadDetail()) })
  }
}
`)

    expect(propsType).toContain(`titleKey: "admin.ui.greeting"`)
    expect(propsType).not.toContain('InertiaTranslationKeys')
    expect(propsType).not.toContain('MessageKeys')
  })

  it('resolves prefix-filtered props identically on a clean regen and a seeded regen', () => {
    // Idempotency guard: the InertiaI18nConfig narrowing lives only in the generated
    // inertia.d.ts, so a clean regen (no prior file on disk) used to widen an
    // InertiaTranslationKeys prop to the full MessageKeys, while a seeded regen (prior
    // file present) narrowed it — a non-idempotent output CI produces in a single pass.
    // `seedInertiaI18nAugmentation` registers that narrowing into the program before the
    // prop walk, so both runs resolve identically. `only` is a real non-empty prefix so
    // the filtered set is a strict subset of MessageKeys (drops `core.back`); the prop is
    // reached through a deferred callback + nested object, dropping its alias so detection
    // falls back to structural identity — the path that diverged.
    const only = ['admin.ui']

    // withPriorOutput models a seeded regen: a stale inertia.d.ts already loaded from
    // disk. The clean regen (false) has none. Either way the seed must overwrite it and
    // yield byte-identical output.
    function run(withPriorOutput: boolean): string {
      const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          strict: true,
        },
      })

      project.createSourceFile('/node_modules/stratal/package.json', JSON.stringify({ name: 'stratal', exports: { './i18n': './i18n.d.ts' } }))
      project.createSourceFile(
        '/node_modules/stratal/i18n.d.ts',
        `
export type DeepKeys<T, P extends string = ''> = T extends object
  ? { [K in keyof T & string]: T[K] extends object ? DeepKeys<T[K], \`\${P}\${K}.\`> : \`\${P}\${K}\` }[keyof T & string]
  : never
export type Messages = { admin: { ui: { greeting: string; farewell: string } }; core: { back: string } }
export type MessageKeys = DeepKeys<Messages>
export type FilterByPrefix<Keys extends string, Prefix extends string> =
  Keys extends \`\${Prefix}.\${string}\` ? Keys
  : Keys extends Prefix ? Keys
  : never
`,
      )
      project.createSourceFile('/node_modules/@stratal/inertia/package.json', JSON.stringify({ name: '@stratal/inertia', types: 'index.d.ts' }))
      project.createSourceFile(
        '/node_modules/@stratal/inertia/index.d.ts',
        `
import type { MessageKeys } from 'stratal/i18n'
export interface InertiaI18nConfig {}
export type InertiaTranslationKeys = InertiaI18nConfig extends { translationKeys: infer T extends string } ? T : MessageKeys
`,
      )

      if (withPriorOutput) {
        project.createSourceFile(
          '/src/inertia/inertia.d.ts',
          `
declare module '@stratal/inertia' {
  interface InertiaI18nConfig {
    translationKeys: import('stratal/i18n').FilterByPrefix<import('stratal/i18n').MessageKeys, 'admin.ui'>
  }
}
export {}
`,
        )
      }

      project.createSourceFile(
        '/src/notes.controller.ts',
        `
${FIXTURE_HEADER}

import type { InertiaTranslationKeys } from '@stratal/inertia'

declare function loadDetail(): Promise<{
  nameKey: InertiaTranslationKeys
}>

declare const ctx: InertiaContext

export class NotesController {
  index() {
    return ctx.inertia('notes/Index', { detail: ctx.defer(() => loadDetail()) })
  }
}
`,
      )

      // Drive the exact production order.
      seedInertiaI18nAugmentation(project, '/src/inertia/inertia.d.ts', { enabled: true, only })
      primeTranslationKeys(project, only, '/src')

      const pages = extractControllerPageTypes(project, SyntaxKind, ts, '/src', '/src/inertia/pages')
      const note = pages.find((p) => p.componentName === 'notes/Index')
      if (!note) throw new Error('expected notes/Index page to be extracted')
      return note.propsType
    }

    const cleanProps = run(false)
    const seededProps = run(true)

    expect(cleanProps).toContain("nameKey: import('@stratal/inertia').InertiaTranslationKeys")
    expect(cleanProps).not.toContain("import('stratal/i18n').MessageKeys")
    expect(cleanProps).toBe(seededProps)
  })

  it('unwraps a branded PromiseLike (ZenStack-shape) return from a deferred callback', () => {
    const propsType = generatePropsType(
      `
interface ZenStackPromise<T> extends PromiseLike<T> {
  readonly [Symbol.toStringTag]: 'ZenStackPromise'
  catch: <U = never>(onrejected?: ((reason: unknown) => U | PromiseLike<U>) | null) => ZenStackPromise<T | U>
  finally: (onfinally?: (() => void) | null) => ZenStackPromise<T>
}

declare function findMany(): ZenStackPromise<Array<{ id: string; title: string }>>
`,
      `ctx.defer(() => findMany())`,
    )

    expect(propsType).toMatch(/items: Array<\{ id: string; title: string;? \}>/)
    expect(propsType).not.toContain('ZenStackPromise')
    expect(propsType).not.toContain('then:')
    expect(propsType).not.toContain('toStringTag')
  })
})

function createModuleProject(moduleSource: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
    },
  })

  project.createSourceFile('/src/app.module.ts', moduleSource)
  return project
}

describe('detectI18nConfig', () => {
  it('extracts only prefixes from forRoot', () => {
    const project = createModuleProject(`
      declare class InertiaModule {
        static forRoot(options: any): any
      }

      InertiaModule.forRoot({
        rootView: 'app',
        i18n: { only: ['common', 'nav'] },
      })
    `)

    const result = detectI18nConfig(project, SyntaxKind, '/src')
    expect(result.enabled).toBe(true)
    expect(result.only).toEqual(['common', 'nav'])
  })

  it('returns empty only when i18n has no only property', () => {
    const project = createModuleProject(`
      declare class InertiaModule {
        static forRoot(options: any): any
      }

      InertiaModule.forRoot({
        rootView: 'app',
        i18n: {},
      })
    `)

    const result = detectI18nConfig(project, SyntaxKind, '/src')
    expect(result.enabled).toBe(true)
    expect(result.only).toEqual([])
  })

  it('returns disabled when no i18n property exists', () => {
    const project = createModuleProject(`
      declare class InertiaModule {
        static forRoot(options: any): any
      }

      InertiaModule.forRoot({
        rootView: 'app',
      })
    `)

    const result = detectI18nConfig(project, SyntaxKind, '/src')
    expect(result.enabled).toBe(false)
    expect(result.only).toEqual([])
  })

  it('extracts only prefixes from forRootAsync with cross-file config', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
      },
    })

    project.createSourceFile('/src/config/inertia.config.ts', `
      interface FactoryProvider<T> {
        provide: symbol
        useFactory: (...deps: any[]) => T
        inject?: symbol[]
      }

      interface ConfigNamespace<TConfig> {
        readonly KEY: symbol
        readonly factory: (env: any) => TConfig
        asProvider(): FactoryProvider<TConfig>
      }

      declare function registerAs<TConfig extends object>(
        namespace: string,
        factory: (env: any) => TConfig,
      ): ConfigNamespace<TConfig>

      interface InertiaModuleOptions {
        rootView: string
        i18n?: { only?: string[] }
      }

      export const inertiaConfig = registerAs('inertia', (env: any) => {
        return {
          rootView: 'app',
          i18n: {
            only: ['shared', 'admin', 'process'],
          },
        } satisfies InertiaModuleOptions
      })
    `)

    project.createSourceFile('/src/app.module.ts', `
      import { inertiaConfig } from './config/inertia.config'

      declare class InertiaModule {
        static forRootAsync(provider: any): any
      }

      InertiaModule.forRootAsync(inertiaConfig.asProvider())
    `)

    const result = detectI18nConfig(project, SyntaxKind, '/src')
    expect(result.enabled).toBe(true)
    expect(result.only).toEqual(['shared', 'admin', 'process'])
  })
})

describe('generateInertiaTypes', () => {
  it('emits InertiaI18nConfig augmentation when only prefixes are present', () => {
    const output = generateInertiaTypes({
      pages: [],
      sharedData: null,
      shareCallTypes: new Map(),
      i18n: { enabled: true, only: ['common', 'nav'] },
      flashTypes: null,
      accessControl: null,
    })

    expect(output).toContain('interface InertiaI18nConfig')
    expect(output).toContain("'common' | 'nav'")
    expect(output).toContain('FilterByPrefix')
    expect(output).toContain('locale: string')
    expect(output).toContain('translations: Record<string, string>')
  })

  it('omits InertiaI18nConfig augmentation when only is empty', () => {
    const output = generateInertiaTypes({
      pages: [],
      sharedData: null,
      shareCallTypes: new Map(),
      i18n: { enabled: true, only: [] },
      flashTypes: null,
      accessControl: null,
    })

    expect(output).not.toContain('InertiaI18nConfig')
    expect(output).toContain('locale: string')
    expect(output).toContain('translations: Record<string, string>')
  })

  it('omits i18n shared props when i18n is disabled', () => {
    const output = generateInertiaTypes({
      pages: [],
      sharedData: null,
      shareCallTypes: new Map(),
      i18n: { enabled: false, only: [] },
      flashTypes: null,
      accessControl: null,
    })

    expect(output).not.toContain('InertiaI18nConfig')
    expect(output).not.toContain('locale')
    expect(output).not.toContain('translations')
  })

  it('emits AccessControlRegistry and the access shared prop', () => {
    const output = generateInertiaTypes({
      pages: [],
      sharedData: null,
      shareCallTypes: new Map(),
      i18n: { enabled: false, only: [] },
      flashTypes: null,
      accessControl: {
        permissions: ['posts', 'posts:*', 'posts:read'],
        roles: ['admin', 'user'],
      },
    })

    expect(output).toContain("  interface AccessControlRegistry {")
    expect(output).toContain("    permissions: 'posts' | 'posts:*' | 'posts:read'")
    expect(output).toContain("    roles: 'admin' | 'user'")
    expect(output).toContain("      access: import('@stratal/inertia').SharedAccess")
  })

  it('emits `never` rather than an empty union if permissions or roles are ever empty', () => {
    // Defensive: `extractAccessControlType` throws before an empty array reaches
    // here, but the emitter must never regress into the invalid-TypeScript bug
    // (`roles: ` with nothing after it) even if a future extractor path slips
    // an empty array through.
    const output = generateInertiaTypes({
      pages: [],
      sharedData: null,
      shareCallTypes: new Map(),
      i18n: { enabled: false, only: [] },
      flashTypes: null,
      accessControl: { permissions: [], roles: [] },
    })

    expect(output).toContain('    permissions: never')
    expect(output).toContain('    roles: never')
    expect(output).not.toMatch(/permissions: $/m)
    expect(output).not.toMatch(/roles: $/m)
  })

  it('omits AccessControlRegistry when no access control is configured', () => {
    const output = generateInertiaTypes({
      pages: [],
      sharedData: null,
      shareCallTypes: new Map(),
      i18n: { enabled: false, only: [] },
      flashTypes: null,
      accessControl: null,
    })

    expect(output).not.toContain('AccessControlRegistry')
    expect(output).not.toContain('access:')
  })
})

/**
 * Build an in-memory project containing a controller body of `ctx.flash(...)`
 * calls and run the flash-type extractor against it.
 */
function extractFlash(controllerBody: string): Map<string, string> {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
    },
  })

  project.createSourceFile(
    '/src/demo.controller.ts',
    `
declare const ctx: { flash: (key: string, value: unknown) => void }
declare const cond: boolean

export class DemoController {
  handle() {
    ${controllerBody}
  }
}
`,
  )

  const info = extractFlashTypes(project, SyntaxKind, ts, '/src')
  return new Map((info?.members ?? []).map((m) => [m.name, m.type]))
}

describe('extractFlashTypes', () => {
  it('collects keys from string-literal flash calls', () => {
    const members = extractFlash(`
      ctx.flash('success', 'saved')
      ctx.flash('error', 'failed')
    `)

    expect([...members.keys()].sort()).toEqual(['error', 'success'])
  })

  it('collects both branches of a conditional flash key', () => {
    const members = extractFlash(`
      ctx.flash(cond ? 'success' : 'error', 'message')
    `)

    expect([...members.keys()].sort()).toEqual(['error', 'success'])
    expect(members.get('success')).toBe('string')
    expect(members.get('error')).toBe('string')
  })

  it('collects every branch of a nested conditional flash key', () => {
    const members = extractFlash(`
      ctx.flash(cond ? 'success' : cond ? 'info' : 'error', 'message')
    `)

    expect([...members.keys()].sort()).toEqual(['error', 'info', 'success'])
  })
})

describe('extractShareCallTypes', () => {
  function extractFrom(body: string): Map<string, string> {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
      },
    })

    project.createSourceFile(
      '/src/dashboard.controller.ts',
      `
export interface InertiaAlwaysProp<T = unknown> {
  callback: () => T
}

export interface RouterContext {
  share: (key: string, value: unknown) => void
  always: <T>(callback: () => T) => InertiaAlwaysProp<T>
}

export interface InertiaService {
  share: (key: string, value: unknown) => void
}

export interface Unrelated {
  share: (key: string, value: unknown) => void
}

declare const ctx: RouterContext
declare const inertiaService: InertiaService
declare const unrelated: Unrelated

export class DashboardController {
  inertia!: InertiaService
  optionalInertia?: InertiaService

  index() {
${body}
  }
}
`,
    )

    return extractShareCallTypes(project, SyntaxKind, ts, '/src')
  }

  it('picks up ctx.share()', () => {
    const types = extractFrom(`    ctx.share('tenant', { id: 'a', name: 'b' })`)
    expect(types.get('tenant')).toBe('{ id: string; name: string }')
  })

  it('picks up a service-typed receiver', () => {
    const types = extractFrom(`    inertiaService.share('flagged', true)`)
    expect(types.get('flagged')).toBe('boolean')
  })

  it('ignores share() on an unrelated type', () => {
    const types = extractFrom(`    unrelated.share('nope', 1)`)
    expect(types.has('nope')).toBe(false)
  })

  it('widens literals', () => {
    const types = extractFrom(`    ctx.share('label', 'hello')`)
    expect(types.get('label')).toBe('string')
  })

  it('unwraps an always() wrapper to the callback return type', () => {
    const types = extractFrom(`    ctx.share('access', ctx.always(() => ({ roles: [] as string[] })))`)
    expect(types.get('access')).toBe('{ roles: Array<string> }')
  })

  it('picks up this.inertia.share() through a chained receiver', () => {
    const types = extractFrom(`    this.inertia.share('chained', 'value')`)
    expect(types.get('chained')).toBe('string')
  })

  it('unwraps an always() wrapper shared through a chained receiver', () => {
    const types = extractFrom(`    this.inertia.share('access', ctx.always(() => ({ roles: [] as string[] })))`)
    expect(types.get('access')).toBe('{ roles: Array<string> }')
  })

  it('picks up share() on an optionally-injected receiver (InertiaService | undefined)', () => {
    const types = extractFrom(`    this.optionalInertia?.share('maybe', 42)`)
    expect(types.get('maybe')).toBe('number')
  })
})

describe('extractAccessControlType', () => {
  const AC_HEADER = `
type Statements = { readonly [resource: string]: readonly string[] }

interface AccessControl<TStatements extends Statements = Statements> {
  statements: TStatements
  newRole: (statements: Statements) => Role
}

interface Role { authorize: (req: unknown) => { success: boolean }; statements: Statements }

interface AccessControlOptions<
  TStatements extends Statements = Statements,
  TRoles extends Record<string, unknown> = Record<string, unknown>,
> {
  ac: AccessControl<TStatements>
  roles: { [K in keyof TRoles]: Role }
}

declare function createAccessControl<
  const TResources extends Statements,
  const TRoles extends Record<string, unknown>,
>(config: { resources: TResources; roles: TRoles }): AccessControlOptions<TResources, TRoles>

declare const AuthModule: {
  forRootAsync: (options: { accessControl?: unknown; useFactory: () => unknown }) => unknown
}
`

  function extractFrom(moduleBody: string) {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
      },
    })

    project.createSourceFile('/src/app.module.ts', `${AC_HEADER}\n${moduleBody}`)

    return extractAccessControlType(project, SyntaxKind, '/src/app.module.ts')
  }

  it('resolves an inline accessControl definition', () => {
    const result = extractFrom(`
export const config = AuthModule.forRootAsync({
  accessControl: createAccessControl({
    resources: { posts: ['create', 'read'], admin: ['access'] },
    roles: { admin: {}, editor: {}, user: {} },
  }),
  useFactory: () => ({}),
})
`)

    expect(result).toEqual({
      permissions: [
        'admin', 'admin:*', 'admin:access',
        'posts', 'posts:*', 'posts:create', 'posts:read',
      ],
      roles: ['admin', 'editor', 'user'],
    })
  })

  it('resolves an accessControl defined as a separate const', () => {
    const result = extractFrom(`
const permissions = createAccessControl({
  resources: { posts: ['read'] },
  roles: { viewer: {} },
})

export const config = AuthModule.forRootAsync({
  accessControl: permissions,
  useFactory: () => ({}),
})
`)

    expect(result).toEqual({
      permissions: ['posts', 'posts:*', 'posts:read'],
      roles: ['viewer'],
    })
  })

  it('returns null when no accessControl is configured', () => {
    const result = extractFrom(`
export const config = AuthModule.forRootAsync({ useFactory: () => ({}) })
`)

    expect(result).toBeNull()
  })

  it('throws a resource-names error when no resources resolve at all', () => {
    expect(() => extractFrom(`
declare const dynamicResources: Record<string, string[]>

export const config = AuthModule.forRootAsync({
  accessControl: createAccessControl({
    resources: dynamicResources,
    roles: { admin: {} },
  }),
  useFactory: () => ({}),
})
`)).toThrow(/has no resources that could be resolved to literal names/i)
  })

  it('throws a resource-actions error, distinct from the resource-names error, when a resource\'s actions cannot resolve to literals', () => {
    expect(() => extractFrom(`
declare const dynamicActions: string[]

export const config = AuthModule.forRootAsync({
  accessControl: createAccessControl({
    resources: { posts: dynamicActions },
    roles: { admin: {} },
  }),
  useFactory: () => ({}),
})
`)).toThrow(/resource "posts".*has an action list that could not be resolved to string literals/i)
  })

  it('throws a roles-specific error, distinct from both resource errors, when roles is empty', () => {
    expect(() => extractFrom(`
export const config = AuthModule.forRootAsync({
  accessControl: createAccessControl({
    resources: { posts: ['read'] },
    roles: {},
  }),
  useFactory: () => ({}),
})
`)).toThrow(/has no roles that could be resolved to literal names/i)
  })

  it('throws the roles-specific error when an explicit type annotation on the exported const widens TRoles to its default', () => {
    // `AccessControlOptions<Resources>` supplies only TStatements — TRoles falls back to
    // its `Record<string, unknown>` default, so `permissions` (and therefore `accessControl`)
    // still carries literal resource names but no literal role names at all.
    expect(() => extractFrom(`
type Resources = { posts: readonly ['read'] }

export const permissions: AccessControlOptions<Resources> = createAccessControl({
  resources: { posts: ['read'] },
  roles: { admin: {} },
})

export const config = AuthModule.forRootAsync({
  accessControl: permissions,
  useFactory: () => ({}),
})
`)).toThrow(/has no roles that could be resolved to literal names/i)
  })
})

/**
 * The suite above proves `extractAccessControlType` against a hand-written,
 * idealized fixture (`AC_HEADER`) that mirrors `@stratal/framework`'s
 * `AccessControl`/`AccessControlOptions`/`createAccessControl` shapes. That
 * only guards the extractor against itself — if the framework's real
 * `AccessControlOptions` ever stopped propagating its `TStatements` type
 * parameter into the `ac` field (`packages/framework/src/access-control/types.ts`),
 * the fixture would keep passing while the real feature silently resolved
 * nothing.
 *
 * This suite closes that gap by pointing a ts-morph project directly at the
 * real framework source files (`packages/framework/src/access-control/*.ts`)
 * and running the extractor against a `createAccessControl` call built from
 * the actual `createAccessControl`/`AccessControlOptions` types, not a
 * lookalike. It reads those files off disk purely as TypeScript source at
 * test time via ts-morph — this does NOT create a runtime or package.json
 * dependency on `@stratal/framework`; nothing is imported from
 * `@stratal/framework` in shipped `@stratal/inertia` code.
 *
 * Undeclared assumption: this only resolves because `better-auth` (imported
 * by those framework source files) is hoisted to the repo-root `node_modules`
 * under this repo's `nodeLinker: node-modules` setting. If that ever changes
 * (strict PnP, per-workspace isolation), this suite will fail with a
 * confusing module-resolution error rather than an assertion failure.
 */
describe('extractAccessControlType (against real @stratal/framework types)', () => {
  it('resolves permissions and roles from the real createAccessControl/AccessControlOptions types', () => {
    const project = new Project({
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
      },
    })

    project.addSourceFilesAtPaths(`${FRAMEWORK_ACCESS_CONTROL_DIR}/*.ts`)

    project.createSourceFile(
      '/app/app.module.ts',
      `
import { createAccessControl } from '${FRAMEWORK_ACCESS_CONTROL_DIR}/create-access-control'

declare const AuthModule: {
  forRootAsync: (options: { accessControl?: unknown; useFactory: () => unknown }) => unknown
}

export const config = AuthModule.forRootAsync({
  accessControl: createAccessControl({
    resources: {
      posts: ['create', 'read', 'update', 'delete'],
      admin: ['access'],
    },
    roles: {
      admin: { posts: ['create', 'read', 'update', 'delete'], admin: ['access'] },
      editor: { posts: ['create', 'read', 'update'] },
      user: { posts: ['read'] },
    },
  }),
  useFactory: () => ({}),
})
`,
      { overwrite: true },
    )

    const result = extractAccessControlType(project, SyntaxKind, '/app/app.module.ts')

    expect(result).toEqual({
      permissions: [
        'admin', 'admin:*', 'admin:access',
        'posts', 'posts:*', 'posts:create', 'posts:delete', 'posts:read', 'posts:update',
      ],
      roles: ['admin', 'editor', 'user'],
    })
  })

  it('resolves an accessControl whose roles include one composed with the real extendRole()', () => {
    // Required by the design spec: `extendRole()` is the documented way to compose
    // roles (packages/framework/src/access-control/extend-role.ts), and the
    // extractor must resolve permissions/roles correctly when a role in the map
    // was built that way rather than passed straight through `createAccessControl`.
    const project = new Project({
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
      },
    })

    project.addSourceFilesAtPaths(`${FRAMEWORK_ACCESS_CONTROL_DIR}/*.ts`)

    project.createSourceFile(
      '/app/app.module.ts',
      `
import { createAccessControl } from '${FRAMEWORK_ACCESS_CONTROL_DIR}/create-access-control'
import { extendRole } from '${FRAMEWORK_ACCESS_CONTROL_DIR}/extend-role'

declare const AuthModule: {
  forRootAsync: (options: { accessControl?: unknown; useFactory: () => unknown }) => unknown
}

const base = createAccessControl({
  resources: {
    posts: ['create', 'read', 'update', 'delete'],
    admin: ['access'],
  },
  roles: {
    editor: { posts: ['create', 'read', 'update'] },
  },
})

const superAdminRole = extendRole(base.ac, base.roles.editor, { admin: ['access'] })

export const config = AuthModule.forRootAsync({
  accessControl: {
    ac: base.ac,
    roles: { editor: base.roles.editor, superAdmin: superAdminRole },
  },
  useFactory: () => ({}),
})
`,
      { overwrite: true },
    )

    const result = extractAccessControlType(project, SyntaxKind, '/app/app.module.ts')

    expect(result).toEqual({
      permissions: [
        'admin', 'admin:*', 'admin:access',
        'posts', 'posts:*', 'posts:create', 'posts:delete', 'posts:read', 'posts:update',
      ],
      roles: ['editor', 'superAdmin'],
    })
  })
})
