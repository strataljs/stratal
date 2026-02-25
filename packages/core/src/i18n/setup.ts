/**
 * I18n Setup - Message Compiler Registration
 *
 * Registers a JIT (Just-In-Time) message compiler for @intlify/core-base
 * that works in Cloudflare Workers edge runtime.
 *
 * This must be called ONCE at application startup, before any I18nService instances are created.
 */

import { compile, registerMessageCompiler } from '@intlify/core-base'

let isRegistered = false

/**
 * Setup JIT message compiler for i18n
 *
 * Registers a message compiler that uses JIT compilation mode.
 * In @intlify/core-base v10+, JIT mode is enabled by default, which generates
 * AST (Abstract Syntax Tree) instead of JavaScript code, making it compatible
 * with CSP-restricted environments like Cloudflare Workers.
 *
 * **IMPORTANT:** Call this function once at application startup before creating
 * any I18nService instances. Safe to call multiple times (only registers once).
 *
 * @example
 * ```typescript
 * // In application entry point (before app.initialize())
 * setupI18nCompiler()
 * ```
 */
export function setupI18nCompiler(): void {
  // Guard against multiple registrations
  if (isRegistered) {
    return
  }

  // Register the compile function from @intlify/core-base as the message compiler
  // In v11+, compile() uses JIT mode by default, generating AST instead of JavaScript code
  // This avoids CSP violations (no eval/new Function) in Cloudflare Workers
  registerMessageCompiler(compile)

  isRegistered = true

  console.log('[i18n] JIT message compiler registered successfully')
}
