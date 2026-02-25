import type {
  $ZodErrorMap,
  $ZodIssueInvalidKey,
  $ZodIssueInvalidStringFormat,
  $ZodIssueInvalidType,
  $ZodIssueInvalidUnion,
  $ZodIssueNotMultipleOf,
  $ZodIssueTooBig,
  $ZodIssueTooSmall,
  $ZodIssueUnrecognizedKeys,
  $ZodRawIssue,
} from 'zod/v4/core'
import type { MessageKeys } from '../i18n.types'
import type { ErrorMapContext } from './validation.types'

/**
 * Type guards for narrowing Zod v4 issue types
 */
function isInvalidType(issue: $ZodRawIssue): issue is $ZodRawIssue<$ZodIssueInvalidType> {
  return issue.code === 'invalid_type'
}

function isTooBig(issue: $ZodRawIssue): issue is $ZodRawIssue<$ZodIssueTooBig> {
  return issue.code === 'too_big'
}

function isTooSmall(issue: $ZodRawIssue): issue is $ZodRawIssue<$ZodIssueTooSmall> {
  return issue.code === 'too_small'
}

function isInvalidFormat(issue: $ZodRawIssue): issue is $ZodRawIssue<$ZodIssueInvalidStringFormat> {
  return issue.code === 'invalid_format'
}

function isNotMultipleOf(issue: $ZodRawIssue): issue is $ZodRawIssue<$ZodIssueNotMultipleOf> {
  return issue.code === 'not_multiple_of'
}

function isUnrecognizedKeys(issue: $ZodRawIssue): issue is $ZodRawIssue<$ZodIssueUnrecognizedKeys> {
  return issue.code === 'unrecognized_keys'
}

function isInvalidUnion(issue: $ZodRawIssue): issue is $ZodRawIssue<$ZodIssueInvalidUnion> {
  return issue.code === 'invalid_union'
}

function isInvalidKey(issue: $ZodRawIssue): issue is $ZodRawIssue<$ZodIssueInvalidKey> {
  return issue.code === 'invalid_key'
}

/**
 * Maps Zod issue codes to zodI18n message keys
 * Adapted for Zod v4's simpler issue code system
 */
function getMessageKey(issue: $ZodRawIssue): MessageKeys {
  if (isInvalidType(issue)) {
    if (issue.input === undefined) {
      return 'zodI18n.errors.required'
    }
    return 'zodI18n.errors.invalid_type'
  }

  if (isTooSmall(issue)) {
    const typeKey = issue.origin || 'string'
    const exactKey = issue.exact
      ? 'exact'
      : issue.inclusive
        ? 'inclusive'
        : 'not_inclusive'
    return `zodI18n.errors.too_small.${typeKey}.${exactKey}` as MessageKeys
  }

  if (isTooBig(issue)) {
    const typeKey = issue.origin || 'string'
    const exactKey = issue.exact
      ? 'exact'
      : issue.inclusive
        ? 'inclusive'
        : 'not_inclusive'
    return `zodI18n.errors.too_big.${typeKey}.${exactKey}` as MessageKeys
  }

  if (isInvalidFormat(issue)) {
    // Map v4's format to v3-style validation keys
    return `zodI18n.errors.invalid_string.${issue.format}` as MessageKeys
  }

  if (isNotMultipleOf(issue)) {
    return 'zodI18n.errors.not_multiple_of'
  }

  if (isUnrecognizedKeys(issue)) {
    return 'zodI18n.errors.unrecognized_keys'
  }

  if (isInvalidUnion(issue)) {
    return 'zodI18n.errors.invalid_union'
  }

  if (isInvalidKey(issue)) {
    // v4: Replaces invalid_enum_value, invalid_literal
    return 'zodI18n.errors.invalid_enum_value'
  }

  // invalid_element, invalid_value, or unknown codes
  return 'zodI18n.errors.custom.default'
}

/**
 * Extracts interpolation parameters from Zod issue
 * Uses proper type narrowing for v4
 */
function getMessageParams(issue: $ZodRawIssue): Record<string, unknown> {
  const params: Record<string, unknown> = {}

  if (isInvalidType(issue)) {
    params.expected = issue.expected
    params.received = String(issue.input)
    return params
  }

  if (isUnrecognizedKeys(issue)) {
    params.keys = issue.keys.join(', ')
    return params
  }

  if (isInvalidKey(issue)) {
    // v4: For enums and records
    // Since v4 doesn't have options field, we'll use generic message
    return params
  }

  if (isInvalidFormat(issue)) {
    params.validation = issue.format

    // Check for specific string format issues with additional fields
    if ('prefix' in issue) {
      params.startsWith = (issue as { prefix?: string }).prefix
    }
    if ('suffix' in issue) {
      params.endsWith = (issue as { suffix?: string }).suffix
    }
    if ('includes' in issue) {
      params.includes = (issue as { includes?: string }).includes
    }
    if (issue.pattern) {
      params.pattern = issue.pattern
    }

    return params
  }

  if (isTooSmall(issue)) {
    params.minimum = issue.minimum
    params.type = issue.origin
    if (issue.origin === 'date') {
      params.minimum = new Date(Number(issue.minimum)).toLocaleDateString()
    }
    return params
  }

  if (isTooBig(issue)) {
    params.maximum = issue.maximum
    params.type = issue.origin
    if (issue.origin === 'date') {
      params.maximum = new Date(Number(issue.maximum)).toLocaleDateString()
    }
    return params
  }

  if (isNotMultipleOf(issue)) {
    params.multipleOf = issue.divisor
    return params
  }

  return params
}

/**
 * Creates a Zod error map that uses i18n for translation
 * Uses Zod v4 native $ZodErrorMap signature (no ctx parameter)
 */
export function createI18nErrorMap(getContext: () => ErrorMapContext | undefined): $ZodErrorMap {
  return (issue: $ZodRawIssue): { message: string } => {
    // Get message key and params for this issue
    const messageKey = getMessageKey(issue)
    const messageParams = getMessageParams(issue)

    // Get translation context
    const context = getContext()

    if (!context) {
      // Fallback: Use English messages directly
      // This handles config validation at startup, tests, etc.
      return { message: 'Invalid input' }
    }

    // Normal flow: Use context-aware i18n (respects user locale)
    return {
      message: context.t(messageKey, messageParams),
    }
  }
}
