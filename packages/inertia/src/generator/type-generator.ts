import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

export interface PageTypeInfo {
  componentName: string
  propsType: string
}

export interface SharedDataTypeInfo {
  propsType: string
}

async function loadTsMorph() {
  return import('ts-morph')
}

type TsMorphModule = Awaited<ReturnType<typeof loadTsMorph>>
type TsObj = TsMorphModule['ts']
type SourceFile = InstanceType<TsMorphModule['Project']> extends { getSourceFiles(): (infer S)[] } ? S : never
type FunctionDeclaration = ReturnType<SourceFile['getFunctions']>[number]
type Node = ReturnType<SourceFile['getDescendants']>[number]
type Type = ReturnType<Node['getType']>

export async function extractPageTypes(pagesDir: string, tsConfigPath?: string): Promise<PageTypeInfo[]> {
  if (!existsSync(pagesDir)) return []

  const { Project, SyntaxKind, ts } = await loadTsMorph()

  const project = new Project({
    tsConfigFilePath: tsConfigPath,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: tsConfigPath ? undefined : {
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    },
  })

  project.addSourceFilesAtPaths(join(pagesDir, '**/*.{tsx,ts}'))

  const pages: PageTypeInfo[] = []

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath()
    const relPath = relative(pagesDir, filePath).replace(/\\/g, '/')

    if (relPath.includes('__tests__') || relPath.includes('.spec.') || relPath.includes('.test.')) continue

    const fileName = relPath.split('/').pop()!
    if (fileName.startsWith("_") || /^Layout\.(tsx|ts)$/.test(fileName)) continue

    const componentName = relPath
      .replace(/\.(tsx|ts)$/, '')

    const propsType = extractDefaultExportPropsType(sourceFile, SyntaxKind, ts)
    if (propsType !== null) {
      pages.push({ componentName, propsType })
    }
  }

  return pages.sort((a, b) => a.componentName.localeCompare(b.componentName))
}

function extractDefaultExportPropsType(sourceFile: SourceFile, SK: TsMorphModule['SyntaxKind'], tsObj: TsObj): string | null {
  const defaultExportSymbol = sourceFile.getDefaultExportSymbol()
  if (!defaultExportSymbol) return null

  const declarations = defaultExportSymbol.getDeclarations()
  for (const decl of declarations) {
    if (decl.isKind(SK.FunctionDeclaration)) {
      return extractPropsFromFunction(decl, tsObj)
    }

    if (decl.isKind(SK.ExportAssignment)) {
      const expr = decl.getExpression()
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!expr) continue

      if (expr.isKind(SK.FunctionExpression)) {
        return extractPropsFromParams(expr.getParameters(), tsObj)
      }

      if (expr.isKind(SK.Identifier)) {
        return resolveIdentifierPropsType(expr, SK, tsObj)
      }

      if (expr.isKind(SK.ArrowFunction)) {
        return extractPropsFromParams(expr.getParameters(), tsObj)
      }
    }
  }

  return null
}

function extractPropsFromFunction(fn: FunctionDeclaration, tsObj: TsObj): string {
  return extractPropsFromParams(fn.getParameters(), tsObj)
}

function extractPropsFromParams(params: ReturnType<FunctionDeclaration['getParameters']>, tsObj: TsObj): string {
  if (params.length === 0) return 'Record<string, never>'

  const firstParam = params[0]
  const paramType = firstParam.getType()

  return typeToString(paramType, tsObj)
}

function resolveIdentifierPropsType(identifier: Node, SK: TsMorphModule['SyntaxKind'], tsObj: TsObj): string | null {
  const symbol = identifier.getSymbol()
  if (!symbol) return null

  for (const decl of symbol.getDeclarations()) {
    if (decl.isKind(SK.FunctionDeclaration)) {
      return extractPropsFromFunction(decl, tsObj)
    }

    if (decl.isKind(SK.VariableDeclaration)) {
      const init = decl.getInitializer()
      if (init?.isKind(SK.ArrowFunction) || init?.isKind(SK.FunctionExpression)) {
        const fn = init as { getParameters(): ReturnType<FunctionDeclaration['getParameters']> }
        return extractPropsFromParams(fn.getParameters(), tsObj)
      }
    }
  }

  return null
}

function typeToString(type: Type, tsObj: TsObj): string {
  const text = type.getText(undefined, tsObj.TypeFormatFlags.NoTruncation | tsObj.TypeFormatFlags.UseFullyQualifiedType)

  if (text.includes('import(')) {
    return expandTypeToInline(type, tsObj)
  }

  return text
}

function expandTypeToInline(type: Type, tsObj: TsObj, visiting = new Set<Type>()): string {
  if (visiting.has(type)) return 'Record<string, unknown>'
  visiting.add(type)
  try {
    if (type.isObject() && !type.isArray()) {
      const properties = type.getProperties()
      if (properties.length === 0) return 'Record<string, never>'

      const members = properties.map((prop) => {
        const decl = prop.getDeclarations()[0] ?? prop.getValueDeclaration()
        const isOptional = prop.isOptional()
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: ambient/synthetic symbols may lack declarations at runtime
        if (!decl) return `${prop.getName()}${isOptional ? '?' : ''}: unknown`
        const propType = prop.getTypeAtLocation(decl)
        const propTypeStr = expandTypeToInline(propType, tsObj, visiting)
        return `${prop.getName()}${isOptional ? '?' : ''}: ${propTypeStr}`
      })

      return `{ ${members.join('; ')} }`
    }

    if (type.isArray()) {
      const elementType = type.getArrayElementType()
      if (elementType) {
        return `Array<${expandTypeToInline(elementType, tsObj, visiting)}>`
      }
    }

    if (type.isUnion()) {
      return type.getUnionTypes().map((t) => expandTypeToInline(t, tsObj, visiting)).join(' | ')
    }

    if (type.isIntersection()) {
      return type.getIntersectionTypes().map((t) => expandTypeToInline(t, tsObj, visiting)).join(' & ')
    }

    const text = type.getText(undefined, tsObj.TypeFormatFlags.NoTruncation)
    if (text.includes('import(')) {
      return 'Record<string, unknown>'
    }
    return text
  } finally {
    visiting.delete(type)
  }
}

export async function extractSharedDataType(moduleFilePath: string, tsConfigPath?: string): Promise<SharedDataTypeInfo | null> {
  if (!existsSync(moduleFilePath)) return null

  const { Project, SyntaxKind, ts } = await loadTsMorph()

  const project = new Project({
    tsConfigFilePath: tsConfigPath,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: tsConfigPath ? undefined : {
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    },
  })

  const sourceFile = project.addSourceFileAtPath(moduleFilePath)

  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)

  for (const call of callExpressions) {
    const expr = call.getExpression()
    if (!expr.isKind(SyntaxKind.PropertyAccessExpression)) continue

    const propName = expr.getName()
    if (propName !== 'forRoot' && propName !== 'forRootAsync') continue

    const objExpr = expr.getExpression()
    if (!objExpr.isKind(SyntaxKind.Identifier) || objExpr.getText() !== 'InertiaModule') continue

    const args = call.getArguments()
    if (args.length === 0) continue

    const optionsArg = args[0]
    if (!optionsArg.isKind(SyntaxKind.ObjectLiteralExpression)) continue

    const sharedDataProp = optionsArg.getProperty('sharedData')
    if (!sharedDataProp) continue

    if (!sharedDataProp.isKind(SyntaxKind.PropertyAssignment)) continue

    const initializer = sharedDataProp.getInitializer()
    if (!initializer?.isKind(SyntaxKind.ObjectLiteralExpression)) continue

    const members: string[] = []
    for (const prop of initializer.getProperties()) {
      if (!prop.isKind(SyntaxKind.PropertyAssignment)) continue

      const name = prop.getName()
      const value = prop.getInitializer()
      if (!value) continue

      let valueType: string

      if (value.isKind(SyntaxKind.ArrowFunction) || value.isKind(SyntaxKind.FunctionExpression)) {
        const returnType = value.getReturnType()
        valueType = typeToString(returnType, ts)
      } else {
        valueType = typeToString(value.getType(), ts)
      }

      members.push(`${name}: ${valueType}`)
    }

    if (members.length > 0) {
      return { propsType: `{ ${members.join('; ')} }` }
    }
  }

  return null
}

export function generateInertiaTypes(pages: PageTypeInfo[], sharedData?: SharedDataTypeInfo | null): string {
  const lines: string[] = [
    '// Auto-generated by @stratal/inertia. Do not edit.',
    "declare module '@stratal/inertia' {",
  ]

  lines.push('  interface InertiaPageRegistry {')
  for (const page of pages) {
    lines.push(`    '${page.componentName}': ${page.propsType}`)
  }
  lines.push('  }')

  lines.push('}')

  if (sharedData) {
    lines.push('')
    lines.push("declare module '@inertiajs/core' {")
    lines.push('  interface InertiaConfig {')
    lines.push(`    sharedPageProps: ${sharedData.propsType}`)
    lines.push('  }')
    lines.push('}')
  }

  lines.push('', 'export {}', '')

  return lines.join('\n')
}

export function writeInertiaTypes(outputPath: string, content: string): void {
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, content, 'utf-8')
}

export function findAppModulePath(cwd: string): string | undefined {
  const candidates = [
    join(cwd, 'src', 'app.module.ts'),
    join(cwd, 'src', 'app.module.tsx'),
  ]

  return candidates.find(existsSync)
}

export function findPagesDir(cwd: string): string {
  return join(cwd, 'src', 'inertia', 'pages')
}

export function findOutputPath(cwd: string): string {
  return join(cwd, 'src', 'inertia', 'inertia.d.ts')
}

export function findTsConfigPath(cwd: string): string | undefined {
  const candidate = join(cwd, 'tsconfig.json')
  return existsSync(candidate) ? candidate : undefined
}

export async function runTypeGeneration(cwd: string): Promise<{ outputPath: string; pageCount: number }> {
  const pagesDir = findPagesDir(cwd)
  const outputPath = findOutputPath(cwd)
  const moduleFilePath = findAppModulePath(cwd)
  const tsConfigPath = findTsConfigPath(cwd)

  const pages = await extractPageTypes(pagesDir, tsConfigPath)
  const sharedData = moduleFilePath
    ? await extractSharedDataType(moduleFilePath, tsConfigPath)
    : null

  const content = generateInertiaTypes(pages, sharedData)
  writeInertiaTypes(outputPath, content)

  return { outputPath, pageCount: pages.length }
}
