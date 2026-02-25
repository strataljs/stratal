/**
 * Centralized Error Code Registry
 *
 * Error codes are organized by category with specific ranges:
 * - 1000-1999: Validation errors
 * - 2000-2999: Database errors (generic)
 * - 3000-3999: Authentication & Authorization
 * - 4000-4999: Resource errors
 * - 5000-5999: Domain-specific business logic (per module)
 * - 9000-9999: System/Internal errors
 *   - 9000-9099: Router errors
 *   - 9100-9199: Configuration errors
 *   - 9200-9299: Infrastructure errors
 *   - 9300-9399: I18n errors
 */

export const ERROR_CODES = {
  /**
   * Database Errors (2000-2999)
   * Generic database errors thrown by Prisma client extensions
   */
  DATABASE: {
    /** Generic database error */
    GENERIC: 2000,
    /** Record not found in database */
    RECORD_NOT_FOUND: 2001,
    /** Unique constraint violation */
    UNIQUE_CONSTRAINT: 2002,
    /** Foreign key constraint violation */
    FOREIGN_KEY_CONSTRAINT: 2003,
    /** Database connection failed */
    CONNECTION_FAILED: 2004,
    /** Database timeout */
    TIMEOUT: 2005,
    /** Null constraint violation */
    NULL_CONSTRAINT: 2006,
    /** Too many database connections */
    TOO_MANY_CONNECTIONS: 2007,
    /** Transaction conflict or deadlock */
    TRANSACTION_CONFLICT: 2008,
  },

  /**
   * Authentication Errors (3000-3099)
   * Authentication-related failures
   */
  AUTH: {
    /** Invalid credentials provided */
    INVALID_CREDENTIALS: 3000,
    /** Session expired or invalid */
    SESSION_EXPIRED: 3001,
    /** Account locked or disabled */
    ACCOUNT_LOCKED: 3002,
    /** Invalid or expired token */
    INVALID_TOKEN: 3003,
    /** Context not initialized */
    CONTEXT_NOT_INITIALIZED: 3004,
    /** User not authenticated */
    USER_NOT_AUTHENTICATED: 3005,
    /** Tenant context not set */
    TENANT_NOT_SET: 3006,
    /** Email verification required before login */
    EMAIL_NOT_VERIFIED: 3007,
    /** Password doesn't meet minimum length */
    PASSWORD_TOO_SHORT: 3008,
    /** Password exceeds maximum length */
    PASSWORD_TOO_LONG: 3009,
    /** Account with email already exists */
    ACCOUNT_ALREADY_EXISTS: 3010,
    /** User creation failed */
    FAILED_TO_CREATE_USER: 3011,
    /** Session creation failed */
    FAILED_TO_CREATE_SESSION: 3012,
    /** User update failed */
    FAILED_TO_UPDATE_USER: 3013,
    /** Social account already linked */
    SOCIAL_ACCOUNT_LINKED: 3014,
    /** Last account cannot be unlinked */
    CANNOT_UNLINK_LAST_ACCOUNT: 3015,
  },

  /**
   * Authorization Errors (3100-3199)
   * Permission and access control failures
   */
  AUTHZ: {
    /** Insufficient permissions */
    FORBIDDEN: 3100,
    /** Resource access denied */
    ACCESS_DENIED: 3101,
    /** User lacks required role */
    INSUFFICIENT_PERMISSIONS: 3102,
  },

  /**
   * Resource Errors (4000-4999)
   * Generic resource-related errors
   */
  RESOURCE: {
    /** Generic resource not found */
    NOT_FOUND: 4000,
    /** Route/endpoint not found */
    ROUTE_NOT_FOUND: 4004,
    /** Resource conflict or duplicate */
    CONFLICT: 4100,
    /** Resource already exists */
    ALREADY_EXISTS: 4101,
  },

  /**
   * Validation Errors (1000-1999)
   * Input validation failures
   */
  VALIDATION: {
    /** Generic validation error */
    GENERIC: 1000,
    /** Required field missing */
    REQUIRED_FIELD: 1001,
    /** Invalid format */
    INVALID_FORMAT: 1002,
    /** Schema validation failed */
    SCHEMA_VALIDATION: 1003,
    /** Request validation failed (OpenAPI, etc.) */
    REQUEST_VALIDATION: 1004,
  },

  /**
   * Router Errors (9000-9099)
   * Router and controller-related INTERNAL errors
   */
  ROUTER: {
    /** Controller registration error */
    CONTROLLER_REGISTRATION_ERROR: 9005,
    /** Controller method not found */
    CONTROLLER_METHOD_NOT_FOUND: 9006,
    /** OpenAPI route registration failed */
    OPENAPI_ROUTE_REGISTRATION: 9008,
  },

  /**
   * I18n Errors (9300-9399)
   * Internationalization and localization errors
   */
  I18N: {
    /** Translation key missing from all locales */
    TRANSLATION_MISSING: 9300,
    /** Requested locale not supported */
    LOCALE_NOT_SUPPORTED: 9301,
  },

  /**
   * System Errors (9000-9999)
   * Internal system errors and unexpected failures
   */
  SYSTEM: {
    /** Internal server error */
    INTERNAL_ERROR: 9000,

    // Configuration Errors (9100-9199)
    /** Generic configuration error */
    CONFIGURATION_ERROR: 9100,
    /** ConfigService not initialized */
    CONFIG_NOT_INITIALIZED: 9101,
    /** Module already registered */
    MODULE_ALREADY_REGISTERED: 9102,
    /** Circular module dependency detected */
    MODULE_CIRCULAR_DEPENDENCY: 9103,
    /** Module dependency not found */
    MODULE_DEPENDENCY_NOT_FOUND: 9104,
    /** Invalid error code range */
    INVALID_ERROR_CODE_RANGE: 9105,
    /** Invalid module provider configuration */
    INVALID_MODULE_PROVIDER: 9106,

    // Infrastructure Errors (9200-9299)
    /** Generic infrastructure error */
    INFRASTRUCTURE_ERROR: 9200,
    /** Execution context not initialized */
    EXECUTION_CONTEXT_NOT_INITIALIZED: 9201,
    /** Request container not initialized */
    REQUEST_CONTAINER_NOT_INITIALIZED: 9202,
    /** Queue binding not found */
    QUEUE_BINDING_NOT_FOUND: 9203,
    /** Cron job execution failed */
    CRON_EXECUTION_FAILED: 9204,
    /** Queue provider not supported */
    QUEUE_PROVIDER_NOT_SUPPORTED: 9205,
  },
} as const

/**
 * Recursively extract all leaf values from a nested object type
 * Similar to DeepKeys but extracts values instead of keys
 *
 * Example:
 *   { DATABASE: { GENERIC: 2000, NOT_FOUND: 2001 }, AUTH: { INVALID: 3000 } }
 *   becomes
 *   2000 | 2001 | 3000
 */
type DeepValues<T> = T extends object
  ? { [K in keyof T]: DeepValues<T[K]> }[keyof T]
  : T

/**
 * Type helper to extract all error code values
 * Union type of all numeric error codes defined in ERROR_CODES
 *
 * Type: 2000 | 2001 | 2002 | ... | 9203
 */
export type ErrorCode = DeepValues<typeof ERROR_CODES>
