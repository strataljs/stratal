import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { Command } from 'stratal/quarry'
import type { SourceFile, SyntaxKind } from 'ts-morph'
import { runTypeGeneration } from '../generator/type-generator'

/** Outcome of reconciling `src/app.module.ts` with the SSR-enabled InertiaModule. */
type AppModuleUpdate = 'created' | 'ssr-added' | 'unchanged' | 'unwired'
/**
 * The subset of ts-morph's runtime `SyntaxKind` enum that `ensureSsrWiring` reads.
 * Declared structurally (via the enum-member literal types) so ts-morph stays a
 * type-only import here and is loaded lazily where it's actually used.
 */
interface SyntaxKinds {
  CallExpression: SyntaxKind.CallExpression
  ObjectLiteralExpression: SyntaxKind.ObjectLiteralExpression
}

const ROOT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  @viteHead
  @inertiaHead
</head>
<body>
  @inertia
  @viteScripts
</body>
</html>`

const APP_TSX = `import { createInertiaApp } from '@inertiajs/react'

createInertiaApp({
  resolve: async (name) => {
    const pages = import.meta.glob('./pages/**/*.tsx')
    const page = await pages[\`./pages/\${name}.tsx\`]?.()
    if (!page) throw new Error(\`Page not found: \${name}\`)
    return page
  },
})`

const SSR_TSX = `import { createInertiaSsrApp } from '@stratal/inertia/ssr'

export const { render } = createInertiaSsrApp({
  resolve: async (name) => {
    const pages = import.meta.glob('./pages/**/*.tsx')
    const page = await pages[\`./pages/\${name}.tsx\`]?.()
    if (!page) throw new Error(\`Page not found: \${name}\`)
    return page
  },
})`

const HOME_TSX = `export default function Home({ message }: { message: string }) {
  return (
    <div>
      <h1>{message}</h1>
      <p>This page is rendered with Inertia.js and Stratal.</p>
    </div>
  )
}`

export class InertiaInstallCommand extends Command {
  static command = 'inertia:install {--skip-deps : Skip installing npm dependencies}'
  static description = 'Scaffold Inertia.js files for a Stratal project'

  async handle(): Promise<number | undefined> {
    const skipDeps = this.boolean('skip-deps')
    const cwd = process.cwd()
    const inertiaDir = join(cwd, 'src', 'inertia')
    const pagesDir = join(inertiaDir, 'pages')

    // Create directories
    this.info('Creating src/inertia/ directory...')
    mkdirSync(pagesDir, { recursive: true })

    const publicDir = join(inertiaDir, 'public')
    mkdirSync(publicDir, { recursive: true })
    const gitkeepPath = join(publicDir, '.gitkeep')
    if (!existsSync(gitkeepPath)) {
      writeFileSync(gitkeepPath, '', 'utf-8')
    }
    this.success('Created src/inertia/public/')

    // Write template files
    const files = [
      { path: join(inertiaDir, 'root.html'), content: ROOT_HTML, name: 'root.html' },
      { path: join(inertiaDir, 'app.tsx'), content: APP_TSX, name: 'app.tsx' },
      { path: join(inertiaDir, 'ssr.tsx'), content: SSR_TSX, name: 'ssr.tsx' },
      { path: join(pagesDir, 'Home.tsx'), content: HOME_TSX, name: 'pages/Home.tsx' },
    ]

    for (const file of files) {
      if (existsSync(file.path)) {
        this.warn(`Skipping ${file.name} (already exists)`)
      } else {
        writeFileSync(file.path, file.content, 'utf-8')
        this.success(`Created src/inertia/${file.name}`)
      }
    }

    // Modify app.module.ts
    const appModulePath = join(cwd, 'src', 'app.module.ts')
    if (existsSync(appModulePath)) {
      this.info('Updating src/app.module.ts...')
      try {
        const result = await this.updateAppModule(appModulePath)
        if (result === 'created') {
          this.success('Updated src/app.module.ts with InertiaModule')
        } else if (result === 'ssr-added') {
          this.success('Enabled streaming SSR in src/app.module.ts')
        } else if (result === 'unchanged') {
          this.info('InertiaModule (with SSR) already configured in app.module.ts')
        } else {
          this.warn('InertiaModule is configured but SSR could not be auto-wired.')
          this.info("Add `ssr: { bundle: () => import('./inertia/ssr') }` to your InertiaModule options")
        }
      } catch (err) {
        this.warn(`Could not auto-update app.module.ts: ${(err as Error).message}`)
        this.info('Please manually add InertiaModule.forRoot() to your module imports')
      }
    } else {
      this.info('No src/app.module.ts found — please manually configure InertiaModule')
    }

    // Generate initial type definitions
    try {
      const { outputPath, pageCount } = await runTypeGeneration(cwd)
      const relPath = relative(cwd, outputPath)
      this.success(`Generated ${relPath} (${pageCount} page${pageCount !== 1 ? 's' : ''})`)
    } catch {
      this.warn('Could not generate initial type definitions. Run `quarry inertia:types` manually.')
    }

    if (!skipDeps) {
      this.newLine()
      this.info('Install the following dependencies:')
      this.line('  npm install @stratal/inertia @inertiajs/react @inertiajs/vite react react-dom')
      this.line('  npm install -D @types/react @types/react-dom vite @cloudflare/vite-plugin')
    }

    this.newLine()
    this.success('Inertia.js scaffolding complete!')
    this.info('Run `quarry inertia:dev` to start the dev server')

    return 0
  }

  private async updateAppModule(modulePath: string): Promise<AppModuleUpdate> {
    const { Project, SyntaxKind } = await import('ts-morph')

    const project = new Project({ useInMemoryFileSystem: false })
    const sourceFile = project.addSourceFileAtPath(modulePath)

    // Already importing the package — an older install that predates streaming
    // SSR. Wire the existing InertiaModule config to the SSR bundle rather than
    // bailing (which would leave SSR silently disabled).
    const existingImport = sourceFile.getImportDeclaration((decl) =>
      decl.getModuleSpecifierValue() === '@stratal/inertia',
    )
    if (existingImport) {
      const result = this.ensureSsrWiring(sourceFile, SyntaxKind)
      if (result === 'ssr-added') await sourceFile.save()
      return result
    }

    // Fresh install: add the imports and an InertiaModule.forRoot wired for SSR.
    sourceFile.addImportDeclaration({
      defaultImport: 'rootView',
      moduleSpecifier: './inertia/root.html?raw',
    })
    sourceFile.addImportDeclaration({
      namedImports: ['InertiaModule'],
      moduleSpecifier: '@stratal/inertia',
    })

    // Find the @Module decorator and add InertiaModule to imports
    const classes = sourceFile.getClasses()
    for (const cls of classes) {
      const moduleDecorator = cls.getDecorator('Module')
      if (!moduleDecorator) continue

      const args = moduleDecorator.getArguments()
      if (args.length === 0) continue

      const objLiteral = args[0].asKind(SyntaxKind.ObjectLiteralExpression)
      if (!objLiteral) continue

      const importsProp = objLiteral.getProperty('imports')
      if (importsProp) {
        // Add to existing imports array
        const initializer = importsProp.asKind(SyntaxKind.PropertyAssignment)?.getInitializer()
        const arrayLiteral = initializer?.asKind(SyntaxKind.ArrayLiteralExpression)
        if (arrayLiteral) {
          arrayLiteral.addElement(`InertiaModule.forRoot({\n    rootView,\n    ssr: { bundle: () => import('./inertia/ssr') },\n  })`)
        }
      } else {
        // Add imports property
        objLiteral.addPropertyAssignment({
          name: 'imports',
          initializer: `[\n    InertiaModule.forRoot({\n      rootView,\n      ssr: { bundle: () => import('./inertia/ssr') },\n    }),\n  ]`,
        })
      }

      break
    }

    await sourceFile.save()
    return 'created'
  }

  /**
   * Ensure an existing `InertiaModule.forRoot({...})` call opts into the streaming
   * SSR bundle. Returns `ssr-added` when the option is inserted, `unchanged` when
   * one is already present, or `unwired` when no plain `forRoot({...})` object
   * literal is found (e.g. `forRootAsync`, or a config passed by reference) — in
   * which case the caller surfaces a manual instruction.
   */
  private ensureSsrWiring(sourceFile: SourceFile, syntaxKind: SyntaxKinds): AppModuleUpdate {
    const calls = sourceFile.getDescendantsOfKind(syntaxKind.CallExpression)
    for (const call of calls) {
      if (call.getExpression().getText() !== 'InertiaModule.forRoot') continue

      const objLiteral = call.getArguments()[0]?.asKind(syntaxKind.ObjectLiteralExpression)
      if (!objLiteral) continue

      if (objLiteral.getProperty('ssr')) return 'unchanged'

      objLiteral.addPropertyAssignment({
        name: 'ssr',
        initializer: `{ bundle: () => import('./inertia/ssr') }`,
      })
      return 'ssr-added'
    }
    return 'unwired'
  }
}
