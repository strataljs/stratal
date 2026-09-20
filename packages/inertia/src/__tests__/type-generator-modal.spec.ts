import { Project, SyntaxKind, ts } from 'ts-morph'
import { describe, expect, it } from 'vitest'
import { extractControllerPageTypes } from '../generator/type-generator'

const FIXTURE_HEADER = `
export interface InertiaContext {
  inertia: <P>(component: string, props: P) => unknown
  modal: <P>(component: string, props: P, options?: { base?: string }) => unknown
}

declare const ctx: InertiaContext
`

/**
 * Build an in-memory ts-morph project for a controller mixing a ctx.inertia()
 * page and a ctx.modal() page, then run the real extractor against it.
 */
function extractPages() {
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
    '/src/parent.controller.ts',
    `
${FIXTURE_HEADER}

export class ParentController {
  edit() {
    return ctx.modal('Parent/Edit', { item: { id: '1' } }, { base: '/parent' })
  }
  index() {
    return ctx.inertia('Parent/Index', { items: [] as { id: string }[] })
  }
}
`,
  )

  return extractControllerPageTypes(project, SyntaxKind, ts, '/src', '/src/inertia/pages')
}

describe('type generator — modal pages', () => {
  it('registers a ctx.modal() component alongside ctx.inertia() ones', () => {
    const pages = extractPages()
    expect(pages.map((page) => page.componentName).sort()).toEqual(['Parent/Edit', 'Parent/Index'])
  })

  it('reads a modal page props shape', () => {
    const pages = extractPages()
    const edit = pages.find((page) => page.componentName === 'Parent/Edit')
    expect(edit?.propsType).toContain('item')
  })
})
