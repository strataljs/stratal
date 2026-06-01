import { Project, SyntaxKind, ts } from 'ts-morph'
import { describe, expect, it } from 'vitest'
import { detectI18nConfig, extractControllerPageTypes, extractFlashTypes, generateInertiaTypes } from '../generator/type-generator'

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
    })

    expect(output).not.toContain('InertiaI18nConfig')
    expect(output).not.toContain('locale')
    expect(output).not.toContain('translations')
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
