import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

export interface PageTypeInfo {
  componentName: string
  propsType: string
  source: 'page' | 'controller'
}

export interface SharedDataTypeInfo {
  members: SharedDataMember[]
}

export interface SharedDataMember {
  name: string
  type: string
  optional: boolean
}

export interface FlashTypeInfo {
  members: { name: string; type: string }[]
}

async function loadTsMorph() {
  return import('ts-morph')
}

type TsMorphModule = Awaited<ReturnType<typeof loadTsMorph>>
type TsObj = TsMorphModule['ts']
type Project = InstanceType<TsMorphModule['Project']>
type SourceFile = InstanceType<TsMorphModule['Project']> extends { getSourceFiles(): (infer S)[] } ? S : never
type FunctionDeclaration = ReturnType<SourceFile['getFunctions']>[number]
type Node = ReturnType<SourceFile['getDescendants']>[number]
type Type = ReturnType<Node['getType']>

// --- Shared ts-morph project creation ---

async function createProject(tsConfigPath?: string): Promise<{ project: Project; SyntaxKind: TsMorphModule['SyntaxKind']; ts: TsObj }> {
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

  return { project, SyntaxKind, ts }
}

// --- Page component extraction (existing, refactored to accept project) ---

export function extractPageTypes(
  project: Project,
  SK: TsMorphModule['SyntaxKind'],
  tsObj: TsObj,
  pagesDir: string,
): PageTypeInfo[] {
  if (!existsSync(pagesDir)) return []

  project.addSourceFilesAtPaths(join(pagesDir, '**/*.{tsx,ts}'))

  const pages: PageTypeInfo[] = []

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath()
    if (!filePath.includes(pagesDir.replace(/\\/g, '/'))) continue

    const relPath = relative(pagesDir, filePath).replace(/\\/g, '/')

    if (relPath.includes('__tests__') || relPath.includes('.spec.') || relPath.includes('.test.')) continue

    const fileName = relPath.split('/').pop()!
    if (fileName.startsWith("_") || /^Layout\.(tsx|ts)$/.test(fileName)) continue

    const componentName = relPath.replace(/\.(tsx|ts)$/, '')

    const propsType = extractDefaultExportPropsType(sourceFile, SK, tsObj)
    if (propsType !== null) {
      pages.push({ componentName, propsType, source: 'page' })
    }
  }

  return pages.sort((a, b) => a.componentName.localeCompare(b.componentName))
}

// --- Controller ctx.inertia() extraction ---

const WRAPPER_TYPE_NAMES = [
  'InertiaDeferredProp',
  'InertiaMergeProp',
  'InertiaOptionalProp',
  'InertiaOnceProp',
  'InertiaAlwaysProp',
]

export function extractControllerPageTypes(
  project: Project,
  SK: TsMorphModule['SyntaxKind'],
  tsObj: TsObj,
  srcDir: string,
  pagesDir: string,
): PageTypeInfo[] {
  project.addSourceFilesAtPaths(join(srcDir, '**/*.ts'))

  const pages = new Map<string, string>()

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath()
    // Skip page files — those are handled by extractPageTypes
    if (filePath.includes(pagesDir.replace(/\\/g, '/'))) continue
    // Skip test files
    if (filePath.includes('__tests__') || filePath.includes('.spec.') || filePath.includes('.test.')) continue

    const callExpressions = sourceFile.getDescendantsOfKind(SK.CallExpression)

    for (const call of callExpressions) {
      const expr = call.getExpression()
      if (!expr.isKind(SK.PropertyAccessExpression)) continue
      if (expr.getName() !== 'inertia') continue

      const args = call.getArguments()
      if (args.length === 0) continue

      // First arg must be a string literal (component name)
      const firstArg = args[0]
      if (!firstArg.isKind(SK.StringLiteral)) continue
      const componentName = firstArg.getLiteralValue()

      // Already have this component from a previous call — skip
      if (pages.has(componentName)) continue

      // Second arg is the props object
      if (args.length < 2) {
        pages.set(componentName, 'Record<string, never>')
        continue
      }

      const propsArg = args[1]
      const propsType = propsArg.getType()

      // Unwrap prop wrappers from each property
      if (propsType.isObject() && !propsType.isArray()) {
        const properties = propsType.getProperties()
        if (properties.length === 0) {
          pages.set(componentName, 'Record<string, never>')
          continue
        }

        const members = properties.map((prop) => {
          const decl = prop.getDeclarations()[0] ?? prop.getValueDeclaration()
          const isOptional = prop.isOptional()
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (!decl) return `${prop.getName()}${isOptional ? '?' : ''}: unknown`

          const propType = prop.getTypeAtLocation(decl)
          const unwrapped = unwrapWrapperType(propType, tsObj)
          return `${prop.getName()}${isOptional ? '?' : ''}: ${unwrapped}`
        })

        pages.set(componentName, `{ ${members.join('; ')} }`)
      } else {
        pages.set(componentName, typeToString(propsType, tsObj))
      }
    }
  }

  return Array.from(pages.entries())
    .map(([componentName, propsType]) => ({ componentName, propsType, source: 'controller' as const }))
    .sort((a, b) => a.componentName.localeCompare(b.componentName))
}

function unwrapWrapperType(type: Type, tsObj: TsObj): string {
  if (type.isUnion()) {
    const unionTypes = type.getUnionTypes()
    const unwrapped = unionTypes
      .filter((t) => {
        const text = t.getText(undefined, tsObj.TypeFormatFlags.NoTruncation)
        return !WRAPPER_TYPE_NAMES.some((name) => text.includes(name))
      })
      .map((t) => typeToString(t, tsObj))

    if (unwrapped.length > 0) {
      return unwrapped.join(' | ')
    }
  }

  // Check if the type itself is a wrapper type — extract callback return type
  const text = type.getText(undefined, tsObj.TypeFormatFlags.NoTruncation)
  for (const wrapperName of WRAPPER_TYPE_NAMES) {
    if (text.includes(wrapperName)) {
      const callbackProp = type.getProperty('callback')
      if (callbackProp) {
        const decl = callbackProp.getDeclarations()[0] ?? callbackProp.getValueDeclaration()
        const callbackType = callbackProp.getTypeAtLocation(decl)
        const callSignatures = callbackType.getCallSignatures()
        if (callSignatures.length > 0) {
          return typeToString(callSignatures[0].getReturnType(), tsObj)
        }
      }
      return 'unknown'
    }
  }

  return typeToString(type, tsObj)
}

// --- Extract this.inertia.share() call types ---

export function extractShareCallTypes(
  project: Project,
  SK: TsMorphModule['SyntaxKind'],
  tsObj: TsObj,
  srcDir: string,
): Map<string, string> {
  const shareTypes = new Map<string, string>()

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath()
    if (!filePath.startsWith(srcDir.replace(/\\/g, '/'))) continue
    if (filePath.includes('__tests__') || filePath.includes('.spec.') || filePath.includes('.test.')) continue

    const callExpressions = sourceFile.getDescendantsOfKind(SK.CallExpression)

    for (const call of callExpressions) {
      const expr = call.getExpression()
      if (!expr.isKind(SK.PropertyAccessExpression)) continue
      if (expr.getName() !== 'share') continue

      // Check that the object is inertia-related (this.inertia.share, inertia.share)
      const objExpr = expr.getExpression()
      const objText = objExpr.getText()
      if (!objText.includes('inertia')) continue

      const args = call.getArguments()
      if (args.length < 2) continue

      const keyArg = args[0]
      if (!keyArg.isKind(SK.StringLiteral)) continue
      const key = keyArg.getLiteralValue()

      if (shareTypes.has(key)) continue

      const valueType = widenLiteralType(args[1].getType(), tsObj)
      shareTypes.set(key, valueType)
    }
  }

  return shareTypes
}

// --- Detect i18n config in InertiaModule.forRoot() ---

export function detectI18nConfig(
  project: Project,
  SK: TsMorphModule['SyntaxKind'],
  moduleFilePath: string,
): boolean {
  const sourceFile = project.getSourceFile(moduleFilePath)
  if (!sourceFile) return false

  const callExpressions = sourceFile.getDescendantsOfKind(SK.CallExpression)

  for (const call of callExpressions) {
    const expr = call.getExpression()
    if (!expr.isKind(SK.PropertyAccessExpression)) continue

    const propName = expr.getName()
    if (propName !== 'forRoot' && propName !== 'forRootAsync') continue

    const objExpr = expr.getExpression()
    if (!objExpr.isKind(SK.Identifier) || objExpr.getText() !== 'InertiaModule') continue

    const args = call.getArguments()
    if (args.length === 0) continue

    const optionsArg = args[0]
    if (!optionsArg.isKind(SK.ObjectLiteralExpression)) continue

    return !!optionsArg.getProperty('i18n')
  }

  return false
}

// --- Extract ctx.flash() call types ---

export function extractFlashTypes(
  project: Project,
  SK: TsMorphModule['SyntaxKind'],
  tsObj: TsObj,
  srcDir: string,
): FlashTypeInfo | null {
  const flashMembers = new Map<string, string>()

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath()
    if (!filePath.startsWith(srcDir.replace(/\\/g, '/'))) continue
    if (filePath.includes('__tests__') || filePath.includes('.spec.') || filePath.includes('.test.')) continue

    const callExpressions = sourceFile.getDescendantsOfKind(SK.CallExpression)

    for (const call of callExpressions) {
      const expr = call.getExpression()
      if (!expr.isKind(SK.PropertyAccessExpression)) continue
      if (expr.getName() !== 'flash') continue

      const args = call.getArguments()
      if (args.length < 2) continue

      const keyArg = args[0]
      if (!keyArg.isKind(SK.StringLiteral)) continue
      const key = keyArg.getLiteralValue()

      if (flashMembers.has(key)) continue

      const valueType = widenLiteralType(args[1].getType(), tsObj)
      flashMembers.set(key, valueType)
    }
  }

  if (flashMembers.size === 0) return null

  return {
    members: Array.from(flashMembers.entries()).map(([name, type]) => ({ name, type })),
  }
}

// --- Extract shared data from module config (existing, refactored) ---

export function extractSharedDataType(
  project: Project,
  SK: TsMorphModule['SyntaxKind'],
  tsObj: TsObj,
  moduleFilePath: string,
): SharedDataTypeInfo | null {
  const sourceFile = project.getSourceFile(moduleFilePath)
    ?? project.addSourceFileAtPath(moduleFilePath)

  const callExpressions = sourceFile.getDescendantsOfKind(SK.CallExpression)

  for (const call of callExpressions) {
    const expr = call.getExpression()
    if (!expr.isKind(SK.PropertyAccessExpression)) continue

    const propName = expr.getName()
    if (propName !== 'forRoot' && propName !== 'forRootAsync') continue

    const objExpr = expr.getExpression()
    if (!objExpr.isKind(SK.Identifier) || objExpr.getText() !== 'InertiaModule') continue

    const args = call.getArguments()
    if (args.length === 0) continue

    const optionsArg = args[0]
    if (!optionsArg.isKind(SK.ObjectLiteralExpression)) continue

    const sharedDataProp = optionsArg.getProperty('sharedData')
    if (!sharedDataProp) continue

    if (!sharedDataProp.isKind(SK.PropertyAssignment)) continue

    const initializer = sharedDataProp.getInitializer()
    if (!initializer?.isKind(SK.ObjectLiteralExpression)) continue

    const members: SharedDataMember[] = []
    for (const prop of initializer.getProperties()) {
      if (!prop.isKind(SK.PropertyAssignment)) continue

      const name = prop.getName()
      const value = prop.getInitializer()
      if (!value) continue

      let valueType: string

      if (value.isKind(SK.ArrowFunction) || value.isKind(SK.FunctionExpression)) {
        const returnType = value.getReturnType()
        valueType = typeToString(returnType, tsObj)
      } else {
        valueType = typeToString(value.getType(), tsObj)
      }

      members.push({ name, type: valueType, optional: false })
    }

    if (members.length > 0) {
      return { members }
    }
  }

  return null
}

// --- Merge page types from page files and controller calls ---

export function mergePageTypes(pageTypes: PageTypeInfo[], controllerTypes: PageTypeInfo[]): PageTypeInfo[] {
  const pageMap = new Map<string, PageTypeInfo>()

  // Page component types take priority
  for (const page of pageTypes) {
    pageMap.set(page.componentName, page)
  }

  // Controller types fill in when page doesn't exist
  for (const controller of controllerTypes) {
    if (!pageMap.has(controller.componentName)) {
      pageMap.set(controller.componentName, controller)
    }
  }

  return Array.from(pageMap.values()).sort((a, b) => a.componentName.localeCompare(b.componentName))
}

// --- Generate output ---

export interface GenerateTypesInput {
  pages: PageTypeInfo[]
  sharedData: SharedDataTypeInfo | null
  shareCallTypes: Map<string, string>
  hasI18n: boolean
  flashTypes: FlashTypeInfo | null
}

export function generateInertiaTypes(input: GenerateTypesInput): string {
  const { pages, sharedData, shareCallTypes, hasI18n, flashTypes } = input

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

  // Build InertiaConfig augmentation
  const configMembers: string[] = []

  // Flash data type
  if (flashTypes && flashTypes.members.length > 0) {
    const flashProps = flashTypes.members
      .map((m) => `${m.name}?: ${m.type}`)
      .join('; ')
    configMembers.push(`    flashDataType: { ${flashProps} }`)
  }

  // Shared page props
  const sharedMembers: string[] = []

  // From module config (non-optional)
  if (sharedData) {
    for (const member of sharedData.members) {
      sharedMembers.push(`      ${member.name}${member.optional ? '?' : ''}: ${member.type}`)
    }
  }

  // From i18n detection (non-optional)
  if (hasI18n) {
    sharedMembers.push('      locale: string')
    sharedMembers.push('      translations: Record<string, string>')
  }

  // From .share() calls (optional — per-request)
  for (const [key, type] of shareCallTypes) {
    // Skip if already declared by module config
    if (sharedData?.members.some((m) => m.name === key)) continue
    sharedMembers.push(`      ${key}?: ${type}`)
  }

  if (sharedMembers.length > 0) {
    configMembers.push(`    sharedPageProps: {\n${sharedMembers.join('\n')}\n    }`)
  }

  if (configMembers.length > 0) {
    lines.push('')
    lines.push("declare module '@inertiajs/core' {")
    lines.push('  interface InertiaConfig {')
    for (const member of configMembers) {
      lines.push(member)
    }
    lines.push('  }')
    lines.push('}')
  }

  lines.push('', 'export {}', '')

  return lines.join('\n')
}

// --- Type string helpers (unchanged) ---

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

function widenLiteralType(type: Type, tsObj: TsObj): string {
  if (type.isStringLiteral()) return 'string'
  if (type.isNumberLiteral()) return 'number'
  if (type.isBooleanLiteral()) return 'boolean'
  return typeToString(type, tsObj)
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

// --- File path helpers ---

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

// --- Main pipeline ---

export async function runTypeGeneration(cwd: string): Promise<{ outputPath: string; pageCount: number }> {
  const pagesDir = findPagesDir(cwd)
  const srcDir = join(cwd, 'src')
  const outputPath = findOutputPath(cwd)
  const moduleFilePath = findAppModulePath(cwd)
  const tsConfigPath = findTsConfigPath(cwd)

  // Single shared project for all extractors
  const { project, SyntaxKind, ts } = await createProject(tsConfigPath)

  // 1. Controller ctx.inertia() calls — sole source of truth for InertiaPageRegistry
  const pages = extractControllerPageTypes(project, SyntaxKind, ts, srcDir, pagesDir)

  // 2. Module shared data config
  const sharedData = moduleFilePath
    ? extractSharedDataType(project, SyntaxKind, ts, moduleFilePath)
    : null

  // 3. i18n detection
  const hasI18n = moduleFilePath
    ? detectI18nConfig(project, SyntaxKind, moduleFilePath)
    : false

  // 4. Per-request .share() calls
  const shareCallTypes = extractShareCallTypes(project, SyntaxKind, ts, srcDir)

  // 5. Flash ctx.flash() calls
  const flashTypes = extractFlashTypes(project, SyntaxKind, ts, srcDir)

  // 6. Generate
  const content = generateInertiaTypes({
    pages,
    sharedData,
    shareCallTypes,
    hasI18n,
    flashTypes,
  })
  writeInertiaTypes(outputPath, content)

  return { outputPath, pageCount: pages.length }
}
