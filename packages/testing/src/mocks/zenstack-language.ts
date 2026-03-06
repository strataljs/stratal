/**
 * Mock for @zenstackhq/language package
 *
 * The @zenstackhq/language package depends on vscode-languageserver which is
 * incompatible with Cloudflare Workers runtime. These exports are only used
 * for schema generation (CLI functionality), not runtime authentication.
 *
 * This mock provides stub implementations to allow tests to run in vitest-pool-workers.
 */

// Main exports from @zenstackhq/language
export const formatDocument = (content: string) => content

export const loadDocument = (_path: string) => ({
	success: false,
	errors: ['Mock: loadDocument not available in test environment'],
})

export class ZModelCodeGenerator {
	generate(_model: unknown): string {
		return ''
	}
}

// AST exports from @zenstackhq/language/ast
export const isDataModel = (_item: unknown): boolean => false
export const isAttribute = (_item: unknown): boolean => false
export const isAbstractDeclaration = (_item: unknown): boolean => false
export const isExpression = (_item: unknown): boolean => false
export const isLiteralExpr = (_item: unknown): boolean => false
export const isArrayExpr = (_item: unknown): boolean => false
export const isAttributeArg = (_item: unknown): boolean => false
export const isBinaryExpr = (_item: unknown): boolean => false
export const isBooleanLiteral = (_item: unknown): boolean => false
export const isConfigArrayExpr = (_item: unknown): boolean => false
export const isConfigField = (_item: unknown): boolean => false
export const isDataField = (_item: unknown): boolean => false
export const isDataFieldAttribute = (_item: unknown): boolean => false
export const isDataFieldType = (_item: unknown): boolean => false
export const isDataModelAttribute = (_item: unknown): boolean => false

// Utils exports from @zenstackhq/language/utils
export const hasAttribute = (_node: unknown, _name?: string): boolean => false

export default {
	formatDocument,
	loadDocument,
	ZModelCodeGenerator,
	isDataModel,
	isAttribute,
	hasAttribute,
}
