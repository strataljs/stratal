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
  primeTranslationKeys(project)

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
  // Collapse a (possibly nullable) message-key union before the union branch below
  // splits it into per-member calls, which would inline every key literal.
  const keyMatch = matchTranslationKeyReference(type, fallbackLocation)
  if (keyMatch) {
    return emitTranslationKeyMatch(keyMatch, false)
  }

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

// --- Extract ctx.share() / this.inertia.share() call types ---

/**
 * Types whose `.share()` contributes a shared page prop. Matched on the
 * receiver's resolved type rather than its source text, so `ctx.share()`,
 * `this.inertia.share()`, and any aliasing are all recognised while an
 * unrelated `.share()` that merely happens to sit on a variable named
 * something inertia-ish is not.
 */
const SHARE_RECEIVER_TYPE_NAMES = new Set(['RouterContext', 'InertiaService'])

function isShareReceiver(node: Node): boolean {
  // Strip null/undefined first: an optionally-injected receiver typed
  // `InertiaService | undefined` (e.g. `this.inertia?.share(...)`) is a union,
  // and `getSymbol()` on a union type itself returns `undefined` — without this
  // the receiver check would silently skip every optional receiver.
  const type = node.getType().getNonNullableType()
  const name = type.getSymbol()?.getName() ?? type.getAliasSymbol()?.getName()
  return name !== undefined && SHARE_RECEIVER_TYPE_NAMES.has(name)
}

export function extractShareCallTypes(
  project: Project,
  SK: TsMorphModule['SyntaxKind'],
  tsObj: TsObj,
  srcDir: string,
): Map<string, string> {
  primeTranslationKeys(project)
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

      if (!isShareReceiver(expr.getExpression())) continue

      const args = call.getArguments()
      if (args.length < 2) continue

      const keyArg = args[0]
      if (!keyArg.isKind(SK.StringLiteral)) continue
      const key = keyArg.getLiteralValue()

      if (shareTypes.has(key)) continue

      // Shared values go through the same wrapper unwrapping as page props —
      // `ctx.share('x', ctx.always(() => v))` must type the prop as the value,
      // not as InertiaAlwaysProp. Falls through to literal widening for plain
      // values.
      const valueType = unwrapWrapperType(args[1].getType(), tsObj, args[1])
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

// --- Extract access control resources and roles ---

export interface AccessControlTypeInfo {
  /** Sorted permission strings: `resource`, `resource:*`, and `resource:action`. */
  permissions: string[]
  /** Sorted role names. */
  roles: string[]
}

/**
 * Resolves the app's access control definition into permission strings and role
 * names, for the generated `AccessControlRegistry`.
 *
 * Reads the `accessControl:` property of the `AuthModule.forRootAsync(...)` call
 * in the app module. That is single-valued by construction — no ambiguity about
 * which of several `createAccessControl` calls is in effect — and it targets the
 * definition that is actually wired up.
 *
 * Everything goes through the type checker rather than static evaluation of
 * object literals, so an inline definition, a separate-file const, a workspace
 * package, and an `extendRole()`-composed role all resolve identically.
 *
 * @throws when `accessControl` is present but its resources don't resolve to
 * string literals — emitting a `string`-shaped union would type-check every
 * permission and quietly defeat the point.
 */
export function extractAccessControlType(
  project: Project,
  SK: TsMorphModule['SyntaxKind'],
  moduleFilePath: string,
): AccessControlTypeInfo | null {
  const sourceFile = project.getSourceFile(moduleFilePath)
  if (!sourceFile) return null

  for (const call of sourceFile.getDescendantsOfKind(SK.CallExpression)) {
    const expr = call.getExpression()
    if (!expr.isKind(SK.PropertyAccessExpression)) continue
    if (expr.getName() !== 'forRootAsync') continue

    const optionsArg = call.getArguments()[0]
    if (!optionsArg?.isKind(SK.ObjectLiteralExpression)) continue

    const property = optionsArg.getProperty('accessControl')
    if (!property?.isKind(SK.PropertyAssignment)) continue

    const initializer = property.getInitializer()
    if (!initializer) continue

    const acType = initializer.getType()

    const statementsType = acType
      .getProperty('ac')
      ?.getTypeAtLocation(initializer)
      .getProperty('statements')
      ?.getTypeAtLocation(initializer)

    if (!statementsType) continue

    const permissions: string[] = []

    for (const resourceSymbol of statementsType.getProperties()) {
      const resource = resourceSymbol.getName()
      const actions = resourceSymbol
        .getTypeAtLocation(initializer)
        .getTupleElements()
        .map((element) => element.getLiteralValue())
        .filter((value): value is string => typeof value === 'string')

      if (actions.length === 0) {
        throw new Error(
          `@stratal/inertia: the \`accessControl\` resource "${resource}" in ${moduleFilePath} `
          + 'has an action list that could not be resolved to string literals. Declare its '
          + `actions as a literal array of strings (e.g. \`${resource}: ['read', 'update']\`) `
          + 'so the generated AccessControlRegistry can check permission strings.',
        )
      }

      permissions.push(resource, `${resource}:*`, ...actions.map((action) => `${resource}:${action}`))
    }

    if (permissions.length === 0) {
      throw new Error(
        `@stratal/inertia: the \`accessControl\` option in ${moduleFilePath} has no resources `
        + 'that could be resolved to literal names. Declare `resources` as an object literal '
        + "(e.g. `resources: { posts: ['read'] }`) so the generated AccessControlRegistry can "
        + 'check permission strings.',
      )
    }

    const roles = acType
      .getProperty('roles')
      ?.getTypeAtLocation(initializer)
      .getProperties()
      .map((symbol) => symbol.getName()) ?? []

    if (roles.length === 0) {
      throw new Error(
        `@stratal/inertia: the \`accessControl\` option in ${moduleFilePath} has no roles that `
        + 'could be resolved to literal names. Declare `roles` as an object literal (e.g. '
        + '`roles: { admin: {...} }`) so the generated AccessControlRegistry can check role names.',
      )
    }

    return {
      permissions: permissions.sort((a, b) => a.localeCompare(b)),
      roles: roles.sort((a, b) => a.localeCompare(b)),
    }
  }

  return null
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
  primeTranslationKeys(project)

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
  accessControl: AccessControlTypeInfo | null
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

/**
 * The `InertiaI18nConfig` narrowing this run emits — shared by the emitter and the
 * in-program seed so both are byte-for-byte the same shape.
 */
function inertiaI18nAugmentationLines(only: readonly string[]): string[] {
  const prefixUnion = only.map((p) => `'${p}'`).join(' | ')
  return [
    '  interface InertiaI18nConfig {',
    `    translationKeys: import('stratal/i18n').FilterByPrefix<import('stratal/i18n').MessageKeys, ${prefixUnion}>`,
    '  }',
  ]
}

/**
 * Register the `InertiaI18nConfig` narrowing this run is about to emit into the
 * ts-morph program, so `InertiaTranslationKeys` resolves to the prefix-filtered
 * union while page props are serialized — deterministically, whether or not a
 * prior inertia.d.ts exists on disk. Written at `outputPath`, overwriting any stale
 * augmentation the source glob loaded, so a clean regen and a seeded regen resolve
 * identically. When i18n is off or no prefixes are configured, the file is emptied
 * so a stale narrowing can't linger.
 */
export function seedInertiaI18nAugmentation(
  project: Project,
  outputPath: string,
  i18n: I18nDetectionResult,
): void {
  const body = i18n.enabled && i18n.only.length > 0
    ? [
        "declare module '@stratal/inertia' {",
        ...inertiaI18nAugmentationLines(i18n.only),
        '}',
        'export {}',
        '',
      ].join('\n')
    : 'export {}\n'
  project.createSourceFile(outputPath, body, { overwrite: true })
}

export function generateInertiaTypes(input: GenerateTypesInput): string {
  const { pages, sharedData, shareCallTypes, i18n, flashTypes, accessControl } = input

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
    lines.push(...inertiaI18nAugmentationLines(i18n.only))
  }
  if (accessControl) {
    // Defensive: the extractor throws on an empty resolution (see
    // `extractAccessControlType`), so these should never actually be empty here.
    // Emitting `never` rather than nothing keeps a future extractor change from
    // silently regressing into the invalid-TypeScript bug that guard prevents —
    // `roles: ` with no union at all.
    const permissionsUnion = accessControl.permissions.length > 0
      ? accessControl.permissions.map((p) => `'${p}'`).join(' | ')
      : 'never'
    const rolesUnion = accessControl.roles.length > 0
      ? accessControl.roles.map((r) => `'${r}'`).join(' | ')
      : 'never'
    lines.push('  interface AccessControlRegistry {')
    lines.push(`    permissions: ${permissionsUnion}`)
    lines.push(`    roles: ${rolesUnion}`)
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

  // From access control (non-optional — shared on every Inertia render)
  if (accessControl) {
    sharedMembers.push("      access: import('@stratal/inertia').SharedAccess")
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

const TRANSLATION_KEYS_REFERENCE = "import('@stratal/inertia').InertiaTranslationKeys"
const MESSAGE_KEYS_REFERENCE_MODULE = "import('stratal/i18n')"
const MESSAGE_KEYS_REFERENCE = `${MESSAGE_KEYS_REFERENCE_MODULE}.MessageKeys`

/**
 * The two canonical message-key sets a prop union can equal:
 * - `filtered`: `InertiaTranslationKeys` — the prefix-filtered set exposed to the
 *   frontend (equals `full` when no `i18n.only` prefixes are configured).
 * - `full`: `MessageKeys` — every message key, including namespaces not shared.
 * Either is `null` when its probe can't resolve to a pure string-literal union.
 */
interface TranslationKeySets {
  filtered: Set<string> | null
  full: Set<string> | null
}

/**
 * Per-project cache of the resolved key sets, populated by
 * {@link primeTranslationKeys} before a walk so {@link matchTranslationKeyReference}
 * can match structurally.
 */
const translationKeysByProject = new WeakMap<Project, TranslationKeySets>()

function stringLiteralUnionMembers(type: Type): Set<string> | null {
  const parts = type.isUnion() ? type.getUnionTypes() : [type]
  const members = new Set<string>()
  for (const part of parts) {
    if (!part.isStringLiteral()) return null
    members.add(part.getLiteralValue() as string)
  }
  return members.size > 0 ? members : null
}

/**
 * Resolve the project's key sets once, before walking any prop types. Resolving
 * throwaway probe aliases forces each union to concrete string literals, so they
 * match what prop types resolve to during the walk. Done up front — never mid-walk
 * — so the probe file's add/remove can't invalidate the `Type` objects the
 * recursion is holding.
 *
 * The probe file MUST live inside the source tree (`probeDir`): app message
 * namespaces are registered via `declare module 'stratal/i18n'` augmentations in
 * app source, which are only in scope for files under that tree. A probe at the
 * project root sees only the framework's base `MessageKeys` (a few dozen keys), so
 * every app key fails to match. Placed under `srcDir`, `MessageKeys` resolves to
 * the app's full key set.
 *
 * The filtered probe is built from the detected `only` prefixes
 * (`FilterByPrefix<MessageKeys, ...>`) rather than `InertiaTranslationKeys`: it does
 * not depend on the consumer's `InertiaI18nConfig` augmentation being applied inside
 * the probe, and matches what prefix-filtered props (the common case) resolve to
 * during the walk. When no prefixes are configured the filtered set equals the full
 * set, so fall back to `InertiaTranslationKeys` (which resolves to `MessageKeys`).
 */
export function primeTranslationKeys(project: Project, only?: readonly string[], probeDir = ''): void {
  if (translationKeysByProject.has(project)) return
  const filteredRef = only && only.length > 0
    ? `${MESSAGE_KEYS_REFERENCE_MODULE}.FilterByPrefix<${MESSAGE_KEYS_REFERENCE}, ${only.map((p) => `'${p}'`).join(' | ')}>`
    : TRANSLATION_KEYS_REFERENCE
  const probe = project.createSourceFile(
    join(probeDir, '__stratal_translation_keys_probe__.ts'),
    `export type __ProbeFiltered = ${filteredRef}\n`
    + `export type __ProbeFull = ${MESSAGE_KEYS_REFERENCE}\n`,
    { overwrite: true },
  )
  try {
    const filtered = stringLiteralUnionMembers(probe.getTypeAliasOrThrow('__ProbeFiltered').getType())
    const full = stringLiteralUnionMembers(probe.getTypeAliasOrThrow('__ProbeFull').getType())
    translationKeysByProject.set(project, { filtered, full })
  } finally {
    // The probe is an in-memory ts-morph node (never written to disk); drop it even
    // if resolution throws so it can't linger in the project's source-file list.
    project.removeSourceFile(probe)
  }
}

function setsEqual(a: Set<string>, b: Set<string> | null): boolean {
  if (!b || a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

function isSubset(a: Set<string>, b: Set<string> | null): boolean {
  if (!b) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

/**
 * A string-literal union is treated as the translation-key type resolved with an
 * incomplete set of message-namespace augmentations in scope (see
 * {@link matchTranslationKeyReference}) rather than a hand-picked subset only when
 * it is BOTH:
 * - a large fraction ({@link TRANSLATION_KEY_COVERAGE}) of the full key set, and
 * - large in absolute terms ({@link TRANSLATION_KEY_MIN_MEMBERS}).
 *
 * The fraction alone is not enough: in a project with only a handful of keys, a
 * deliberate two-value enum can already be half the set. The absolute floor keeps
 * such narrow enums inlined regardless of how small the key set is — an
 * under-resolved translation-key union spans dozens to thousands of keys, while a
 * hand-picked enum spans a few.
 */
const TRANSLATION_KEY_COVERAGE = 0.5
const TRANSLATION_KEY_MIN_MEMBERS = 24

interface TranslationKeyMatch {
  /** The type reference to emit in place of the inlined key union. */
  ref: string
  hasNull: boolean
  hasUndefined: boolean
}

/**
 * Detect whether `type` is (a nullable wrapper around) one of the message-key
 * unions, and if so which reference to emit instead of inlining it. Inlining leaks
 * the entire key union (hundreds of literals) into every prop that uses it.
 *
 * The alias survives on a directly-referenced type, but is dropped once the union
 * is reached through nested object/array expansion — ts-morph then yields a bare
 * string-literal union (optionally joined with `null`/`undefined`). So match the
 * alias name when present (never gate on `isUnion()` — the `InertiaTranslationKeys`
 * conditional alias can report `isUnion() === false`), and otherwise fall back to
 * structural identity against the project's resolved key sets, ignoring `null` /
 * `undefined` members (which the caller re-attaches). The filtered set is checked
 * first so a prefix-filtered union stays `InertiaTranslationKeys`; a union equal to
 * the full set references `MessageKeys` (widening it to the filtered alias would
 * silently drop the unshared namespaces).
 *
 * Exact identity is not always reachable: app message namespaces are registered via
 * `declare module 'stratal/i18n'` augmentations, and a prop declared in a file that
 * doesn't transitively import every namespace resolves `InertiaTranslationKeys` to a
 * strict *subset* of the primed set — with no alias to recover (the value flows in
 * through an inferred property access). So collapse any union that is a subset of a
 * key set and clears the {@link TRANSLATION_KEY_COVERAGE} /
 * {@link TRANSLATION_KEY_MIN_MEMBERS} thresholds *measured against that same set* —
 * the filtered set for an `InertiaTranslationKeys` union, the full set for a
 * `MessageKeys` union — to the type the source actually declares. Measuring each
 * against its own set keeps a narrow prefix filter from shrinking the fraction below
 * the threshold, and stops a non-frontend subset from being widened through the
 * small filtered denominator. Small hand-picked key enums fall below the thresholds
 * and stay inlined.
 */
function matchTranslationKeyReference(type: Type, fallbackLocation?: Node): TranslationKeyMatch | null {
  const alias = type.getAliasSymbol?.()?.getName()
  if (alias === 'InertiaTranslationKeys') return { ref: TRANSLATION_KEYS_REFERENCE, hasNull: false, hasUndefined: false }
  if (alias === 'MessageKeys') return { ref: MESSAGE_KEYS_REFERENCE, hasNull: false, hasUndefined: false }

  if (!fallbackLocation) return null
  const sets = translationKeysByProject.get(fallbackLocation.getProject())
  if (!sets) return null

  const parts = type.isUnion() ? type.getUnionTypes() : [type]
  let hasNull = false
  let hasUndefined = false
  const members = new Set<string>()
  for (const part of parts) {
    if (part.isNull()) { hasNull = true; continue }
    if (part.isUndefined()) { hasUndefined = true; continue }
    if (!part.isStringLiteral()) return null
    members.add(part.getLiteralValue() as string)
  }
  if (members.size === 0) return null

  if (setsEqual(members, sets.filtered)) return { ref: TRANSLATION_KEYS_REFERENCE, hasNull, hasUndefined }
  if (setsEqual(members, sets.full)) return { ref: MESSAGE_KEYS_REFERENCE, hasNull, hasUndefined }

  // Under-resolved key space: a subset that is large both as a fraction of the set
  // it belongs to and in absolute terms (see doc comment). Each candidate reference
  // is judged against its own set — a prefix-filtered union against the filtered
  // set, a full-key union against the full set — so a narrow prefix filter doesn't
  // shrink the fraction below the threshold, and a non-frontend subset isn't widened
  // through the small filtered denominator.
  if (
    sets.filtered
    && isSubset(members, sets.filtered)
    && members.size >= TRANSLATION_KEY_MIN_MEMBERS
    && members.size >= TRANSLATION_KEY_COVERAGE * sets.filtered.size
  ) {
    return { ref: TRANSLATION_KEYS_REFERENCE, hasNull, hasUndefined }
  }
  if (
    sets.full
    && isSubset(members, sets.full)
    && members.size >= TRANSLATION_KEY_MIN_MEMBERS
    && members.size >= TRANSLATION_KEY_COVERAGE * sets.full.size
  ) {
    return { ref: MESSAGE_KEYS_REFERENCE, hasNull, hasUndefined }
  }
  return null
}

/**
 * Render a key-union match, re-attaching `null` (and `undefined`, unless the `?`
 * property marker already implies it) that {@link matchTranslationKeyReference}
 * stripped for comparison.
 */
function emitTranslationKeyMatch(match: TranslationKeyMatch, undefinedImplied: boolean): string {
  const prefixes: string[] = []
  if (match.hasNull) prefixes.push('null')
  if (match.hasUndefined && !undefinedImplied) prefixes.push('undefined')
  return prefixes.length > 0 ? `${prefixes.join(' | ')} | ${match.ref}` : match.ref
}

function typeToString(type: Type, tsObj: TsObj, fallbackLocation?: Node): string {
  const keyMatch = matchTranslationKeyReference(type, fallbackLocation)
  if (keyMatch) {
    return emitTranslationKeyMatch(keyMatch, false)
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
  // Collapse a (possibly nullable) message-key union before splitting it apart —
  // the per-member expansion below would otherwise inline every key literal.
  const keyMatch = matchTranslationKeyReference(type, fallbackLocation)
  if (keyMatch) {
    return emitTranslationKeyMatch(keyMatch, isOptional)
  }

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
    const keyMatch = matchTranslationKeyReference(type, fallbackLocation)
    if (keyMatch) {
      return emitTranslationKeyMatch(keyMatch, false)
    }

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

  // Load all source files and detect i18n up front, so the message-key sets can be
  // primed from the configured `only` prefixes before any prop type is walked.
  project.addSourceFilesAtPaths(join(srcDir, '**/*.ts'))
  const i18n = detectI18nConfig(project, SyntaxKind, srcDir)
  // Deterministically seed the InertiaI18nConfig narrowing this run will emit, so
  // InertiaTranslationKeys resolves to the prefix-filtered union during the prop
  // walk — identical whether or not a prior inertia.d.ts was on disk.
  seedInertiaI18nAugmentation(project, outputPath, i18n)
  primeTranslationKeys(project, i18n.only, srcDir)

  // 1. Controller ctx.inertia() calls — sole source of truth for InertiaPageRegistry
  const pages = extractControllerPageTypes(project, SyntaxKind, ts, srcDir, pagesDir)

  // 2. Module shared data config
  const sharedData = moduleFilePath
    ? extractSharedDataType(project, SyntaxKind, ts, moduleFilePath)
    : null

  // 3. Per-request .share() calls
  const shareCallTypes = extractShareCallTypes(project, SyntaxKind, ts, srcDir)

  // 4. Flash ctx.flash() calls
  const flashTypes = extractFlashTypes(project, SyntaxKind, ts, srcDir)

  // 5. Access control resources and roles
  const accessControl = moduleFilePath
    ? extractAccessControlType(project, SyntaxKind, moduleFilePath)
    : null

  // 6. Generate
  const content = generateInertiaTypes({
    pages,
    sharedData,
    shareCallTypes,
    i18n,
    flashTypes,
    accessControl,
  })
  writeInertiaTypes(outputPath, content)

  return { outputPath, pageCount: pages.length }
}
