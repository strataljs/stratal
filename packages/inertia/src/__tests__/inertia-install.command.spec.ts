import { describe, expect, it } from 'vitest'
import { Project, SyntaxKind } from 'ts-morph'
import { InertiaInstallCommand } from '../commands/inertia-install.command'

// `ensureSsrWiring` is a pure helper over a ts-morph SourceFile (it doesn't touch
// instance state), so we can drive it via the prototype against an in-memory file.
type EnsureSsrWiring = (sourceFile: unknown, syntaxKind: typeof SyntaxKind) => string
const ensureSsrWiring = (InertiaInstallCommand.prototype as unknown as { ensureSsrWiring: EnsureSsrWiring })
  .ensureSsrWiring

function wire(source: string): { result: string; text: string } {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile('app.module.ts', source)
  const result = ensureSsrWiring(sourceFile, SyntaxKind)
  return { result, text: sourceFile.getFullText() }
}

describe('InertiaInstallCommand.ensureSsrWiring', () => {
  it('adds the ssr bundle option to an existing forRoot that lacks it', () => {
    const { result, text } = wire(`
@Module({
  imports: [InertiaModule.forRoot({ rootView })],
})
export class AppModule {}
`)

    expect(result).toBe('ssr-added')
    expect(text).toContain("ssr: { bundle: () => import('./inertia/ssr') }")
  })

  it('leaves an already-wired forRoot untouched', () => {
    const source = `
@Module({
  imports: [InertiaModule.forRoot({ rootView, ssr: { bundle: () => import('./inertia/ssr') } })],
})
export class AppModule {}
`
    const { result, text } = wire(source)

    expect(result).toBe('unchanged')
    expect(text).toBe(source)
  })

  it('reports unwired when the config is not a plain forRoot object literal', () => {
    const { result, text } = wire(`
@Module({
  imports: [InertiaModule.forRootAsync({ useFactory: () => ({ rootView }) })],
})
export class AppModule {}
`)

    expect(result).toBe('unwired')
    expect(text).not.toContain('./inertia/ssr')
  })
})
