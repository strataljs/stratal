import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
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

  // Map from component name to all collected prop type strings (one per call site)
  const pages = new Map<string, string[]>()

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

      if (!pages.has(componentName)) {
        pages.set(componentName, [])
      }

      // Second arg is the props object
      if (args.length < 2) {
        pages.get(componentName)!.push('Record<string, never>')
        continue
      }

      const propsArg = args[1]
      const propsType = propsArg.getType()

      // Unwrap prop wrappers from each property
      if (propsType.isObject() && !propsType.isArray()) {
        const properties = propsType.getProperties()
        if (properties.length === 0) {
          pages.get(componentName)!.push('Record<string, never>')
          continue
        }

        const members = properties.map((prop) => {
          const decl = prop.getDeclarations()[0] ?? prop.getValueDeclaration()
          const location = decl ?? propsArg
          const isOptional = prop.isOptional()
          const propType = prop.getTypeAtLocation(location)
          const unwrapped = unwrapWrapperType(propType, tsObj, propsArg)
          return `${prop.getName()}${isOptional ? '?' : ''}: ${unwrapped}`
        })

        pages.get(componentName)!.push(`{ ${members.join('; ')} }`)
      } else {
        pages.get(componentName)!.push(typeToString(propsType, tsObj, propsArg))
      }
    }
  }

  return Array.from(pages.entries())
    .map(([componentName, typeVariants]) => {
      // Deduplicate identical variants then join with union
      const unique = [...new Set(typeVariants)]
      const propsType = unique.length === 1 ? unique[0] : unique.join(' | ')
      return { componentName, propsType }
    })
    .sort((a, b) => a.componentName.localeCompare(b.componentName))
}

function unwrapWrapperType(type: Type, tsObj: TsObj, fallbackLocation?: Node): string {
  if (type.isUnion()) {
    const unionTypes = type.getUnionTypes()
    const unwrapped = unionTypes
      .filter((t) => {
        const text = t.getText(undefined, tsObj.TypeFormatFlags.NoTruncation)
        return !WRAPPER_TYPE_NAMES.some((name) => text.includes(name))
      })
      .map((t) => typeToString(t, tsObj, fallbackLocation))

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
        const location = decl ?? fallbackLocation
        if (!location) return 'unknown'
        const callbackType = callbackProp.getTypeAtLocation(location)
        const callSignatures = callbackType.getCallSignatures()
        if (callSignatures.length > 0) {
          return unwrapPromise(callSignatures[0].getReturnType(), tsObj, fallbackLocation)
        }
      }
      return 'unknown'
    }
  }

  return widenLiteralType(type, tsObj, fallbackLocation)
}

function unwrapPromise(type: Type, tsObj: TsObj, fallbackLocation?: Node): string {
  // `getAwaitedType()` resolves the `Awaited<T>` of any thenable — covers
  // `Promise<T>`, `PromiseLike<T>`, and branded thenables (e.g. ZenStack's
  // `ZenStackPromise<T>`) whose text doesn't start with `Promise<`.
  const awaited = type.getAwaitedType?.()
  if (awaited && awaited !== type) {
    return stripReadonly(awaited, tsObj, fallbackLocation)
  }
  return stripReadonly(type, tsObj, fallbackLocation)
}

function stripReadonly(type: Type, tsObj: TsObj, fallbackLocation?: Node): string {
  if (type.isTuple()) {
    const elements = type.getTupleElements()
    const parts = elements.map((e) => typeToString(e, tsObj, fallbackLocation))
    return `[${parts.join(', ')}]`
  }

  const text = type.getText(undefined, tsObj.TypeFormatFlags.NoTruncation)
  if (text.startsWith('readonly ') && type.isArray()) {
    const elementType = type.getArrayElementType()
    if (elementType) {
      return `Array<${typeToString(elementType, tsObj, fallbackLocation)}>`
    }
  }

  return typeToString(type, tsObj, fallbackLocation)
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

/**
 * Given the first argument of `Module.forRoot(...)` or `Module.forRootAsync(...)`,
 * return the object literal where downstream options actually live.
 *
 * - For `forRoot({...})` the literal IS the first arg.
 * - For `forRootAsync({ inject, useFactory: (...) => ({...}) })` we drill into
 *   the `useFactory`'s return value:
 *     `() => ({ … })`                  — ParenthesizedExpression → ObjectLiteral
 *     `() => ({ ... } as Foo)`         — AsExpression → ObjectLiteral
 *     `() => { return { … } }`         — Block → ReturnStatement → ObjectLiteral
 *
 * Returns `null` when nothing usable is found.
 */
function resolveModuleOptionsLiteral(
  optionsArg: Node,
  SK: TsMorphModule['SyntaxKind'],
): Node | null {
  if (!optionsArg.isKind(SK.ObjectLiteralExpression)) return null

  // forRootAsync wrapper: { inject, useFactory: (env) => ({ ... }) }
  const useFactoryProp = optionsArg.getProperty('useFactory')
  if (useFactoryProp?.isKind(SK.PropertyAssignment)) {
    const initializer = useFactoryProp.getInitializer()
    if (initializer?.isKind(SK.ArrowFunction) || initializer?.isKind(SK.FunctionExpression)) {
      const body = initializer.getBody()

      // Concise arrow body: () => ({...}) — Parenthesized
      if (body.isKind(SK.ParenthesizedExpression)) {
        const inner = unwrapAs(body.getExpression(), SK)
        if (inner?.isKind(SK.ObjectLiteralExpression)) return inner
      }

      // Concise arrow body returning a plain literal (rare without parens but legal)
      const unwrapped = unwrapAs(body, SK)
      if (unwrapped?.isKind(SK.ObjectLiteralExpression)) return unwrapped

      // Block body: { ... return {...}; }
      if (body.isKind(SK.Block)) {
        const returnStatements = body.getDescendantsOfKind(SK.ReturnStatement)
        // Walk in reverse so a later `return` wins (last-write-wins semantics)
        for (let i = returnStatements.length - 1; i >= 0; i--) {
          const ret = returnStatements[i]
          const expr = ret.getExpression()
          if (!expr) continue
          if (expr.isKind(SK.ParenthesizedExpression)) {
            const inner = unwrapAs(expr.getExpression(), SK)
            if (inner?.isKind(SK.ObjectLiteralExpression)) return inner
            continue
          }
          const direct = unwrapAs(expr, SK)
          if (direct?.isKind(SK.ObjectLiteralExpression)) return direct
        }
      }
    }
  }

  // Plain forRoot({...}) — the first arg IS the options literal.
  return optionsArg
}

/**
 * Strip a single `as Foo` cast if present, otherwise return the node as-is.
 * `useFactory: (env) => ({ ... } as Options)` is common in TypeScript.
 */
function unwrapAs(node: Node | undefined, SK: TsMorphModule['SyntaxKind']): Node | undefined {
  if (!node) return undefined
  if (node.isKind(SK.AsExpression) || node.isKind(SK.TypeAssertionExpression)) {
    return node.getExpression()
  }
  if (node.isKind(SK.SatisfiesExpression)) {
    return node.getExpression()
  }
  return node
}

export interface I18nDetectionResult {
  enabled: boolean
  only: string[]
}

export function detectI18nConfig(
  project: Project,
  SK: TsMorphModule['SyntaxKind'],
  srcDir: string,
): I18nDetectionResult {
  const none: I18nDetectionResult = { enabled: false, only: [] }
  const normalizedSrcDir = srcDir.replace(/\\/g, '/')

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath()
    if (!filePath.startsWith(normalizedSrcDir)) continue
    if (filePath.includes('__tests__') || filePath.includes('.spec.') || filePath.includes('.test.')) continue

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

      // 1. AST-based: direct object literals (same-file forRoot / forRootAsync with inline useFactory)
      const optionsLiteral = resolveModuleOptionsLiteral(args[0], SK)
      if (optionsLiteral?.isKind(SK.ObjectLiteralExpression)) {
        const i18nProp = optionsLiteral.getProperty('i18n')
        if (!i18nProp) continue
        return { enabled: true, only: extractOnlyFromLiteral(i18nProp, SK) }
      }

      // 2. AST-based cross-file: follow identifier.asProvider() → registerAs factory
      const configLiteral = resolveConfigLiteralFromAsProvider(args[0], SK)
      if (configLiteral?.isKind(SK.ObjectLiteralExpression)) {
        const i18nProp = configLiteral.getProperty('i18n')
        if (i18nProp) return { enabled: true, only: extractOnlyFromLiteral(i18nProp, SK) }
      }

      // 3. Type-based fallback: check if the resolved type has an i18n property
      const optionsType = resolveOptionsType(args[0], propName)
      if (optionsType?.getProperty('i18n')) {
        return { enabled: true, only: extractOnlyFromType(optionsType, args[0]) }
      }
    }
  }

  return none
}

function resolveConfigLiteralFromAsProvider(
  arg: Node,
  SK: TsMorphModule['SyntaxKind'],
): Node | null {
  if (!arg.isKind(SK.CallExpression)) return null

  const callExpr = arg.getExpression()
  if (!callExpr.isKind(SK.PropertyAccessExpression)) return null
  if (callExpr.getName() !== 'asProvider') return null

  const configIdentifier = callExpr.getExpression()
  if (!configIdentifier.isKind(SK.Identifier)) return null

  const varDecl = resolveToVariableDeclaration(configIdentifier, SK)
  if (!varDecl) return null

  return extractLiteralFromRegisterAs(varDecl, SK)
}

function resolveToVariableDeclaration(
  identifier: Node,
  SK: TsMorphModule['SyntaxKind'],
): Node | null {
  const symbol = identifier.getSymbol()
  if (!symbol) return null

  for (const decl of symbol.getDeclarations()) {
    if (decl.isKind(SK.VariableDeclaration)) return decl

    if (decl.isKind(SK.ImportSpecifier)) {
      const sourceFile = decl.getImportDeclaration().getModuleSpecifierSourceFile()
      if (!sourceFile) continue

      const exportName = decl.getName()
      const exported = sourceFile.getExportedDeclarations().get(exportName)
      if (!exported) continue

      for (const exportDecl of exported) {
        if (exportDecl.isKind(SK.VariableDeclaration)) return exportDecl
      }
    }
  }

  return null
}

function extractLiteralFromRegisterAs(
  varDecl: Node,
  SK: TsMorphModule['SyntaxKind'],
): Node | null {
  if (!varDecl.isKind(SK.VariableDeclaration)) return null

  const init = varDecl.getInitializer()
  if (!init?.isKind(SK.CallExpression)) return null

  const factoryArgs = init.getArguments()
  if (factoryArgs.length < 2) return null

  const factory = factoryArgs[1]
  if (!factory.isKind(SK.ArrowFunction) && !factory.isKind(SK.FunctionExpression)) return null

  const body = factory.getBody()

  if (body.isKind(SK.ParenthesizedExpression)) {
    const inner = unwrapAs(body.getExpression(), SK)
    if (inner?.isKind(SK.ObjectLiteralExpression)) return inner
  }

  const unwrapped = unwrapAs(body, SK)
  if (unwrapped?.isKind(SK.ObjectLiteralExpression)) return unwrapped

  if (body.isKind(SK.Block)) {
    const returnStatements = body.getDescendantsOfKind(SK.ReturnStatement)
    for (let i = returnStatements.length - 1; i >= 0; i--) {
      const ret = returnStatements[i]
      const retExpr = ret.getExpression()
      if (!retExpr) continue
      if (retExpr.isKind(SK.ParenthesizedExpression)) {
        const inner = unwrapAs(retExpr.getExpression(), SK)
        if (inner?.isKind(SK.ObjectLiteralExpression)) return inner
        continue
      }
      const direct = unwrapAs(retExpr, SK)
      if (direct?.isKind(SK.ObjectLiteralExpression)) return direct
    }
  }

  return null
}

function extractOnlyFromLiteral(i18nProp: Node, SK: TsMorphModule['SyntaxKind']): string[] {
  const only: string[] = []
  if (!i18nProp.isKind(SK.PropertyAssignment)) return only
  const init = i18nProp.getInitializer()
  if (!init?.isKind(SK.ObjectLiteralExpression)) return only
  const onlyProp = init.getProperty('only')
  if (!onlyProp?.isKind(SK.PropertyAssignment)) return only
  const onlyInit = onlyProp.getInitializer()
  if (!onlyInit?.isKind(SK.ArrayLiteralExpression)) return only
  for (const el of onlyInit.getElements()) {
    if (el.isKind(SK.StringLiteral)) {
      only.push(el.getLiteralValue())
    }
  }
  return only
}

function resolveOptionsType(arg: Node, methodName: string): Type | null {
  const argType = arg.getType()

  if (methodName === 'forRoot') {
    return argType
  }

  // forRootAsync: arg is FactoryProvider-shaped — drill through useFactory return type
  const useFactorySymbol = argType.getProperty('useFactory')
  if (!useFactorySymbol) return null

  const useFactoryType = useFactorySymbol.getTypeAtLocation(arg)
  const signatures = useFactoryType.getCallSignatures()
  if (signatures.length === 0) return null

  const returnType = signatures[0].getReturnType()

  // Return type is T | Promise<T> — find the branch with i18n
  if (returnType.isUnion()) {
    for (const member of returnType.getUnionTypes()) {
      if (member.getProperty('i18n')) return member
    }
    return null
  }

  return returnType
}

function extractOnlyFromType(optionsType: Type, locationNode: Node): string[] {
  const i18nSymbol = optionsType.getProperty('i18n')
  if (!i18nSymbol) return []

  const i18nType = i18nSymbol.getTypeAtLocation(locationNode)
  const onlySymbol = i18nType.getProperty('only')
  if (!onlySymbol) return []

  const onlyType = onlySymbol.getTypeAtLocation(locationNode)
  const elementType = onlyType.getNumberIndexType()
  if (!elementType) return []

  const result: string[] = []
  if (elementType.isUnion()) {
    for (const member of elementType.getUnionTypes()) {
      if (member.isStringLiteral()) {
        result.push(member.getLiteralValue() as string)
      }
    }
  } else if (elementType.isStringLiteral()) {
    result.push(elementType.getLiteralValue() as string)
  }
  return result
}

// --- Extract ctx.flash() call types ---

/**
 * Collect every string-literal value a flash-key argument can resolve to.
 *
 * A direct string literal yields a single key. A conditional expression
 * (`cond ? 'a' : 'b'`, including nested ternaries) contributes the literals
 * from each branch. Non-literal keys (variables, template strings) yield
 * nothing — they can't be statically known.
 */
function collectFlashKeyLiterals(node: Node, SK: TsMorphModule['SyntaxKind']): string[] {
  const stringLiteral = node.asKind(SK.StringLiteral)
  if (stringLiteral) return [stringLiteral.getLiteralValue()]

  const conditional = node.asKind(SK.ConditionalExpression)
  if (conditional) {
    return [
      ...collectFlashKeyLiterals(conditional.getWhenTrue(), SK),
      ...collectFlashKeyLiterals(conditional.getWhenFalse(), SK),
    ]
  }

  return []
}

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

      // The key may be a plain string literal or a conditional expression
      // selecting between several literals (e.g. `cond ? 'success' : 'error'`).
      // Every literal a branch can produce is a real flash key.
      const keys = collectFlashKeyLiterals(args[0], SK)
      if (keys.length === 0) continue

      const valueType = widenLiteralType(args[1].getType(), tsObj)
      for (const key of keys) {
        if (flashMembers.has(key)) continue
        flashMembers.set(key, valueType)
      }
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

    const optionsLiteral = resolveModuleOptionsLiteral(args[0], SK)
    if (!optionsLiteral || !optionsLiteral.isKind(SK.ObjectLiteralExpression)) continue

    const sharedDataProp = optionsLiteral.getProperty('sharedData')
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
  i18n: I18nDetectionResult
  flashTypes: FlashTypeInfo | null
}

function componentNameToPropsTypeName(componentName: string, segmentCount = 2): string {
  const segments = componentName.split('/')
  const used = segments.slice(-segmentCount)
  return used.map(toPascalCase).join('') + 'PageProps'
}

function toPascalCase(segment: string): string {
  return segment
    .split(/[-_\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
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
  const { pages, sharedData, shareCallTypes, i18n, flashTypes } = input

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
  if (i18n.enabled && i18n.only.length > 0) {
    const prefixUnion = i18n.only.map((p) => `'${p}'`).join(' | ')
    lines.push('  interface InertiaI18nConfig {')
    lines.push(`    translationKeys: import('stratal/i18n').FilterByPrefix<import('stratal/i18n').MessageKeys, ${prefixUnion}>`)
    lines.push('  }')
  }
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
  if (i18n.enabled) {
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

function widenLiteralType(type: Type, tsObj: TsObj, fallbackLocation?: Node): string {
  if (type.isStringLiteral()) return 'string'
  if (type.isNumberLiteral()) return 'number'
  if (type.isBooleanLiteral()) return 'boolean'
  return typeToString(type, tsObj, fallbackLocation)
}

function typeToString(type: Type, tsObj: TsObj, fallbackLocation?: Node): string {
  // Preserve MessageKeys as InertiaTranslationKeys — narrows automatically via i18n.only augmentation
  if (type.isUnion() && type.getAliasSymbol?.()?.getName() === 'MessageKeys') {
    return "import('@stratal/inertia').InertiaTranslationKeys"
  }

  // Always expand objects/unions/intersections so getText() can't leak inline
  // index signatures (e.g. StratalRouteMap params' `[key: string]: ...`).
  if (type.isObject() || type.isUnion() || type.isIntersection()) {
    return expandTypeToInline(type, tsObj, fallbackLocation)
  }

  const text = type.getText(undefined, tsObj.TypeFormatFlags.NoTruncation | tsObj.TypeFormatFlags.UseFullyQualifiedType)

  if (text.includes('import(')) {
    return expandTypeToInline(type, tsObj, fallbackLocation)
  }

  return text
}

function expandPropertyType(
  type: Type,
  tsObj: TsObj,
  fallbackLocation: Node | undefined,
  visiting: Set<Type>,
  isOptional: boolean,
): string {
  // The `?` marker already implies `undefined`, so strip it from the union
  // to avoid `id?: undefined | string`.
  if (isOptional && type.isUnion()) {
    const parts = type.getUnionTypes().filter((t) => !t.isUndefined())
    if (parts.length === 0) return 'undefined'
    if (parts.length === 1) return expandTypeToInline(parts[0], tsObj, fallbackLocation, visiting)
    return parts.map((t) => expandTypeToInline(t, tsObj, fallbackLocation, visiting)).join(' | ')
  }
  return expandTypeToInline(type, tsObj, fallbackLocation, visiting)
}

function expandTypeToInline(
  type: Type,
  tsObj: TsObj,
  fallbackLocation?: Node,
  visiting = new Set<Type>(),
): string {
  if (visiting.has(type)) return 'unknown'
  // `boolean` is internally `true | false` — short-circuit before the union branch.
  if (type.isBoolean()) return 'boolean'
  visiting.add(type)
  try {
    if (type.isObject() && !type.isArray() && !type.isReadonlyArray()) {
      // Named global types (Date, RegExp, Map, Set, ...) — emit text as-is.
      // Expanding them iterates every method and produces garbage like
      // `{ toString: ...; getTime: ...; }` for Date.
      const symbolName = type.getSymbol()?.getName()
      const text = type.getText(undefined, tsObj.TypeFormatFlags.NoTruncation | tsObj.TypeFormatFlags.UseFullyQualifiedType)
      if (
        symbolName
        && !symbolName.startsWith('__')
        && symbolName !== 'Object'
        && !text.includes('import(')
      ) {
        return text
      }

      const properties = type.getProperties()
      if (properties.length === 0) {
        const stringIndexType = type.getStringIndexType()
        if (stringIndexType) {
          return `Record<string, ${expandTypeToInline(stringIndexType, tsObj, fallbackLocation, visiting)}>`
        }
        // Use `{}` not `Record<string, never>` — `never` collapses intersections.
        return '{}'
      }

      const members = properties.map((prop) => {
        const decl = prop.getDeclarations()[0] ?? prop.getValueDeclaration()
        const location = decl ?? fallbackLocation
        const isOptional = prop.isOptional()
        if (!location) return `${prop.getName()}${isOptional ? '?' : ''}: unknown`
        const propType = prop.getTypeAtLocation(location)
        const propTypeStr = expandPropertyType(propType, tsObj, fallbackLocation, visiting, isOptional)
        return `${prop.getName()}${isOptional ? '?' : ''}: ${propTypeStr}`
      })

      return `{ ${members.join('; ')} }`
    }

    if (type.isArray() || type.isReadonlyArray()) {
      const elementType = type.getArrayElementType()
      if (elementType) {
        const inner = expandTypeToInline(elementType, tsObj, fallbackLocation, visiting)
        return type.isReadonlyArray() ? `ReadonlyArray<${inner}>` : `Array<${inner}>`
      }
    }

    if (type.isUnion()) {
      if (type.getAliasSymbol?.()?.getName() === 'MessageKeys') {
        return "import('@stratal/inertia').InertiaTranslationKeys"
      }
      return type.getUnionTypes().map((t) => expandTypeToInline(t, tsObj, fallbackLocation, visiting)).join(' | ')
    }

    if (type.isIntersection()) {
      return type.getIntersectionTypes().map((t) => expandTypeToInline(t, tsObj, fallbackLocation, visiting)).join(' & ')
    }

    const text = type.getText(undefined, tsObj.TypeFormatFlags.NoTruncation)
    if (text.includes('import(')) {
      return 'unknown'
    }
    return text
  } finally {
    visiting.delete(type)
  }
}

// --- File path helpers ---

export function writeInertiaTypes(outputPath: string, content: string): boolean {
  if (existsSync(outputPath)) {
    try {
      if (readFileSync(outputPath, 'utf-8') === content) return false
    } catch {
      // fall through and write
    }
  }
  mkdirSync(dirname(outputPath), { recursive: true })
  const tmpPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmpPath, content, 'utf-8')
  renameSync(tmpPath, outputPath)
  return true
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

  // 3. i18n detection (scans all source files for InertiaModule.forRoot*)
  const i18n = detectI18nConfig(project, SyntaxKind, srcDir)

  // 4. Per-request .share() calls
  const shareCallTypes = extractShareCallTypes(project, SyntaxKind, ts, srcDir)

  // 5. Flash ctx.flash() calls
  const flashTypes = extractFlashTypes(project, SyntaxKind, ts, srcDir)

  // 6. Generate
  const content = generateInertiaTypes({
    pages,
    sharedData,
    shareCallTypes,
    i18n,
    flashTypes,
  })
  writeInertiaTypes(outputPath, content)

  return { outputPath, pageCount: pages.length }
}
