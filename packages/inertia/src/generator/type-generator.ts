import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface PageTypeInfo {
  componentName: string
  propsType: string
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
    .map(([componentName, propsType]) => ({ componentName, propsType }))
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
          return unwrapPromise(callSignatures[0].getReturnType(), tsObj)
        }
      }
      return 'unknown'
    }
  }

  return typeToString(type, tsObj)
}

function unwrapPromise(type: Type, tsObj: TsObj): string {
  const text = type.getText(undefined, tsObj.TypeFormatFlags.NoTruncation)
  if (text.startsWith('Promise<')) {
    const typeArgs = type.getTypeArguments()
    if (typeArgs.length > 0) {
      return stripReadonly(typeArgs[0], tsObj)
    }
  }
  return stripReadonly(type, tsObj)
}

function stripReadonly(type: Type, tsObj: TsObj): string {
  if (type.isTuple()) {
    const elements = type.getTupleElements()
    const parts = elements.map((e) => typeToString(e, tsObj))
    return `[${parts.join(', ')}]`
  }

  const text = type.getText(undefined, tsObj.TypeFormatFlags.NoTruncation)
  if (text.startsWith('readonly ') && type.isArray()) {
    const elementType = type.getArrayElementType()
    if (elementType) {
      return `Array<${typeToString(elementType, tsObj)}>`
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

// --- Generate output ---

export interface GenerateTypesInput {
  pages: PageTypeInfo[]
  sharedData: SharedDataTypeInfo | null
  shareCallTypes: Map<string, string>
  hasI18n: boolean
  flashTypes: FlashTypeInfo | null
}

function componentNameToPropsTypeName(componentName: string, segmentCount = 2): string {
  const segments = componentName.split('/')
  const used = segments.slice(-segmentCount)
  return used.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('') + 'PageProps'
}

function resolvePagePropsTypeNames(pages: PageTypeInfo[]): Map<string, string> {
  const result = new Map<string, string>()

  // First pass: use last 2 segments
  const nameToComponents = new Map<string, string[]>()
  for (const page of pages) {
    const typeName = componentNameToPropsTypeName(page.componentName)
    const existing = nameToComponents.get(typeName) ?? []
    existing.push(page.componentName)
    nameToComponents.set(typeName, existing)
  }

  // Second pass: resolve collisions by using all segments
  for (const [typeName, components] of nameToComponents) {
    if (components.length === 1) {
      result.set(components[0], typeName)
    } else {
      for (const componentName of components) {
        const fullSegments = componentName.split('/').length
        result.set(componentName, componentNameToPropsTypeName(componentName, fullSegments))
      }
    }
  }

  return result
}

export function generateInertiaTypes(input: GenerateTypesInput): string {
  const { pages, sharedData, shareCallTypes, hasI18n, flashTypes } = input

  // Compute type names with collision resolution
  const typeNames = resolvePagePropsTypeNames(pages)

  const lines: string[] = [
    '// Auto-generated by @stratal/inertia. Do not edit.',
  ]

  // Global page props types
  if (pages.length > 0) {
    lines.push('declare global {')
    for (const page of pages) {
      const typeName = typeNames.get(page.componentName)!
      lines.push(`  type ${typeName} = ${page.propsType}`)
    }
    lines.push('}')
    lines.push('')
  }

  // InertiaPageRegistry augmentation referencing global types
  lines.push("declare module '@stratal/inertia' {")
  lines.push('  interface InertiaPageRegistry {')
  for (const page of pages) {
    const typeName = typeNames.get(page.componentName)!
    lines.push(`    '${page.componentName}': ${typeName}`)
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
    lines.push('  export interface InertiaConfig {')
    for (const member of configMembers) {
      lines.push(member)
    }
    lines.push('  }')
    lines.push('}')
  }

  lines.push('', 'export {}', '')

  return lines.join('\n')
}

// --- Type string helpers ---

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
