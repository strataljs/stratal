import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { Command } from 'stratal/quarry'
import { runTypeGeneration } from '../generator/type-generator'

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
        const updated = await this.updateAppModule(appModulePath)
        if (updated) {
          this.success('Updated src/app.module.ts with InertiaModule')
        } else {
          this.info('InertiaModule already configured in app.module.ts')
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

  private async updateAppModule(modulePath: string): Promise<boolean> {
    const { Project, SyntaxKind } = await import('ts-morph')

    const project = new Project({ useInMemoryFileSystem: false })
    const sourceFile = project.addSourceFileAtPath(modulePath)

    // Check if InertiaModule is already imported
    const existingImport = sourceFile.getImportDeclaration((decl) =>
      decl.getModuleSpecifierValue() === '@stratal/inertia',
    )
    if (existingImport) {
      return false
    }

    // Add rootView import
    sourceFile.addImportDeclaration({
      defaultImport: 'rootView',
      moduleSpecifier: './inertia/root.html?raw',
    })

    // Add InertiaModule import
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
    return true
  }
}
