import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseArgs } from 'node:util'
import { runTypeGeneration } from '../generator/type-generator'
import { logger } from './logger'

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

const HOME_TSX = `export default function Home({ message }: { message: string }) {
  return (
    <div>
      <h1>{message}</h1>
      <p>This page is rendered with Inertia.js and Stratal.</p>
    </div>
  )
}`

export async function runInstall(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      'skip-deps': { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  })

  const skipDeps = values['skip-deps'] === true
  const cwd = process.cwd()
  const inertiaDir = join(cwd, 'src', 'inertia')
  const pagesDir = join(inertiaDir, 'pages')

  logger.info('Creating src/inertia/ directory...')
  mkdirSync(pagesDir, { recursive: true })

  const publicDir = join(inertiaDir, 'public')
  mkdirSync(publicDir, { recursive: true })
  const gitkeepPath = join(publicDir, '.gitkeep')
  if (!existsSync(gitkeepPath)) {
    writeFileSync(gitkeepPath, '', 'utf-8')
  }
  logger.success('Created src/inertia/public/')

  const files = [
    { path: join(inertiaDir, 'root.html'), content: ROOT_HTML, name: 'root.html' },
    { path: join(inertiaDir, 'app.tsx'), content: APP_TSX, name: 'app.tsx' },
    { path: join(pagesDir, 'Home.tsx'), content: HOME_TSX, name: 'pages/Home.tsx' },
  ]

  for (const file of files) {
    if (existsSync(file.path)) {
      logger.warn(`Skipping ${file.name} (already exists)`)
    } else {
      writeFileSync(file.path, file.content, 'utf-8')
      logger.success(`Created src/inertia/${file.name}`)
    }
  }

  const appModulePath = join(cwd, 'src', 'app.module.ts')
  if (existsSync(appModulePath)) {
    logger.info('Updating src/app.module.ts...')
    try {
      const updated = await updateAppModule(appModulePath)
      if (updated) {
        logger.success('Updated src/app.module.ts with InertiaModule')
      } else {
        logger.info('InertiaModule already configured in app.module.ts')
      }
    } catch (err) {
      logger.warn(`Could not auto-update app.module.ts: ${(err as Error).message}`)
      logger.info('Please manually add InertiaModule.forRoot() to your module imports')
    }
  } else {
    logger.info('No src/app.module.ts found — please manually configure InertiaModule')
  }

  try {
    const { outputPath, pageCount } = await runTypeGeneration(cwd)
    const relPath = relative(cwd, outputPath)
    logger.success(`Generated ${relPath} (${pageCount} page${pageCount !== 1 ? 's' : ''})`)
  } catch {
    logger.warn('Could not generate initial type definitions. Run `npx inertia types` manually.')
  }

  if (!skipDeps) {
    logger.newLine()
    logger.info('Install the following dependencies:')
    logger.line('  npm install @stratal/inertia @inertiajs/react @inertiajs/vite react react-dom')
    logger.line('  npm install -D @types/react @types/react-dom vite @cloudflare/vite-plugin')
  }

  logger.newLine()
  logger.success('Inertia.js scaffolding complete!')
  logger.info('Run `npx inertia dev` to start the dev server')

  return 0
}

async function updateAppModule(modulePath: string): Promise<boolean> {
  const { Project, SyntaxKind } = await import('ts-morph')

  const project = new Project({ useInMemoryFileSystem: false })
  const sourceFile = project.addSourceFileAtPath(modulePath)

  const existingImport = sourceFile.getImportDeclaration((decl) =>
    decl.getModuleSpecifierValue() === '@stratal/inertia',
  )
  if (existingImport) {
    return false
  }

  sourceFile.addImportDeclaration({
    defaultImport: 'rootView',
    moduleSpecifier: './inertia/root.html?raw',
  })

  sourceFile.addImportDeclaration({
    namedImports: ['InertiaModule'],
    moduleSpecifier: '@stratal/inertia',
  })

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
      const initializer = importsProp.asKind(SyntaxKind.PropertyAssignment)?.getInitializer()
      const arrayLiteral = initializer?.asKind(SyntaxKind.ArrayLiteralExpression)
      if (arrayLiteral) {
        arrayLiteral.addElement(`InertiaModule.forRoot({\n    rootView,\n  })`)
      }
    } else {
      objLiteral.addPropertyAssignment({
        name: 'imports',
        initializer: `[\n    InertiaModule.forRoot({\n      rootView,\n    }),\n  ]`,
      })
    }

    break
  }

  await sourceFile.save()
  return true
}
