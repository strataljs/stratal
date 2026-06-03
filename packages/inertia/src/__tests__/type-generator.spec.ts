import { Project, SyntaxKind, ts } from 'ts-morph'
import { describe, expect, it } from 'vitest'
import { extractControllerPageTypes } from '../generator/type-generator'

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
