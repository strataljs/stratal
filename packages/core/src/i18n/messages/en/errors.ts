/**
 * System Error Messages - English
 *
 * Error messages used by packages/modules infrastructure.
 * These are automatically merged with application-specific messages.
 */

export const errors = {
  // Generic errors
  internalError: 'An internal error occurred',
  notFound: 'Resource not found',
  unauthorized: 'Unauthorized. Please sign in.',
  forbidden: 'Access denied',

  // Router errors
  honoAppAlreadyConfigured: 'HonoApp has already been configured and can only be configured once',
  routeNotFound: 'Route not found: {method} {path}',
  routeAccessDenied: 'Resource not found',
  controllerMethodNotFound: 'Method {methodName} not found on {controllerName}',
  controllerRegistration: 'Failed to register controller {controllerName}: {reason}',
  duplicateRouteName: 'Duplicate route name "{name}". Already registered by {existingHandler}, cannot register {newHandler}.',
  routeNameNotFound: 'Route "{name}" not found in registry.',
  missingRouteParam: 'Missing required parameter "{param}" for route "{name}" (path: {path}).',
  routerUseScopeViolation: 'router.use() can only be called on the root Router, not inside group() callbacks. Use router.middleware() for scoped middleware.',
  middlewareNextCalledMultipleTimes: 'next() was called multiple times in "{middlewareName}" middleware. Ensure each middleware calls next() at most once.',
  missingEnvironmentVariable: 'Environment variable "{variable}" is required but not set.',

  // WebSocket errors
  websocketBodyNotAvailable: 'body() is not available in WebSocket gateways. Use WebSocket messages instead.',
  websocketDuplicateEventHandler: '@{decorator}() is already applied to \'{existingMethod}\'. Only one method per gateway can handle this event.',

  // Context errors
  contextNotInitialized: 'Context has not been initialized',
  userNotAuthenticated: 'User is not authenticated',
  insufficientPermissions: 'Insufficient permissions to perform this action',
  requestContainerNotInitialized: 'Request container has not been initialized',
  requestScopeOperationNotAllowed: '{methodName}() cannot be called on this container scope. Check if you are calling it on the correct container (global vs request-scoped).',
  conditionalBindingFallback: 'Conditional binding predicate returned false for token "{token}" but no fallback was provided and no existing registration exists.',

  // Configuration errors
  configKeyNotFound: 'Configuration key "{path}" was not found',
  stratalNotInitialized: 'Stratal has not been instantiated. Ensure you export a Stratal instance as the default export.',

  // Module errors
  moduleAlreadyRegistered: 'Module {moduleName} is already registered',
  moduleDependencyNotFound: 'Module dependency {dependency} not found for module {moduleName}',
  moduleCircularDependency: 'Circular dependency detected: {cycle}',
  invalidModuleProvider: 'Invalid module provider configuration: {provider}',

  // Database errors
  databaseGeneric: 'Database error occurred',
  databaseRecordNotFound: 'Record not found in database',
  databaseUniqueConstraint: 'Record already exists',
  databaseForeignKeyConstraint: 'Related record not found',
  databaseConnectionFailed: 'Failed to connect to database',
  databaseTimeout: 'Database query timeout',
  databaseNullConstraint: 'Required field is missing',
  databaseTooManyConnections: 'Too many database connections',
  databaseTransactionConflict: 'Transaction conflict or deadlock',
  databaseConstraintFailed: 'A database constraint was violated',
  databaseTableNotFound: 'The specified table does not exist in the database',
  databaseColumnNotFound: 'The specified column does not exist in the table',
  databaseInvalidQuery: 'The database query is invalid or malformed',
  invalidErrorCodeRange: 'Invalid error code range: {code}',

  // Queue errors
  queueBindingNotFound: 'Queue binding {binding} not found in environment',
  queueProviderNotSupported: 'Queue provider "{provider}" is not supported. Valid providers: cloudflare, sync',

  // Cron errors
  cronExecutionFailed: '{count} cron job(s) failed for schedule "{schedule}": {jobs}',

  // i18n errors
  localeNotSupported: "Locale '{locale}' is not supported. Supported locales: {supportedLocales}",
  translationMissing: "Translation missing for key '{key}' in locale '{locale}'",

  // Container errors
  containerNotInitialized: 'Application container has not been initialized. Ensure Application.initialize() has been called.',

  // Domain routing errors
  domainMismatch: 'The requested domain does not match any configured route',

  // Signature errors
  invalidSignature: 'The URL signature is invalid or has expired',

  // Schema validation errors
  schemaValidation: 'Schema validation failed',
  responseValidation: 'Response validation failed',

  // OpenAPI errors
  openapiValidation: 'OpenAPI validation failed: {details}',
  openapiRouteRegistration: 'Failed to register OpenAPI route {path}: {reason}',

  // Email errors
  email: {
    resendApiKeyMissing: 'Resend API key not configured. Set RESEND_EMAIL_API_KEY environment variable.',
    smtpConfigurationMissing: 'SMTP configuration missing. Set SMTP_URL environment variable.',
    smtpHostMissing: 'SMTP host not configured. Check SMTP_URL format (smtp://user:pass@host:port).',
    smtpConnectionFailed: 'Failed to connect to SMTP server {smtpHost}:{smtpPort}',
    resendApiFailed: 'Resend API error',
    providerNotSupported: 'Unsupported email provider: {provider}. Supported providers: resend, smtp'
  },

  // Storage errors
  storage: {
    fileNotFound: 'File at path "{path}" was not found',
    invalidDisk: 'Storage disk "{disk}" is not configured',
    invalidFileType: 'File type "{mimeType}" is not allowed',
    fileTooLarge: 'File size {size} exceeds maximum allowed size of {maxSize}',
    presignedUrlInvalidExpiry: 'Expiry must be between {min} and {max} seconds',
    diskNotConfigured: 'Disk "{disk}" is not configured',
    responseBodyMissing: 'No body in storage response for path: {path}',
    r2BindingNotFound: 'R2 binding "{binding}" was not found in the environment',
    r2PresignedUrlSecretMissing: 'APP_SECRET environment variable is required for presigned URLs',
  },

  // Cache errors
  cache: {
    getFailed: "Failed to retrieve value from cache for key '{key}'",
    putFailed: "Failed to store value in cache for key '{key}'",
    deleteFailed: "Failed to delete value from cache for key '{key}'",
    listFailed: 'Failed to list cache keys'
  },

  // Rate limiter errors
  rateLimit: {
    tooManyRequests: 'Too Many Requests',
    notDefined: 'Rate limiter "{name}" is not defined. Register it via RateLimiterRegistry.for("{name}", ...) inside a module\'s onInitialize hook.',
    notConfigured: 'RateLimiterModule.forRoot() was not called. Pass a store option ("kv", "memory", or a custom class) to enable rate limiting.',
    moduleNotImported: 'Rate limiter "{name}" was used (router.throttle / @RateLimit) but RateLimiterModule is not imported in your AppModule. Add RateLimiterModule.forRoot() to imports.',
  },

  // Seeder errors
  seederNameCollision: 'Seeder name collision: "{name}" is already registered. Use distinct class names for each seeder.',
  seederNotRegistered: 'Seeder "{name}" is not registered',

  // Migration errors
  migration: {
    failed: 'Migration {migrationName} failed: {error}',
    checksumMismatch: 'Migration {migrationName} checksum mismatch (expected: {expected}, actual: {actual})',
    alreadyApplied: 'Migration {migrationName} has already been applied',
    notFound: 'Migration {migrationName} not found',
  },
} as const
