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
  routerAlreadyConfigured: 'RouterService has already been configured and can only be configured once',
  routerNotConfigured: 'RouterService.configure() must be called before handling requests',
  routeNotFound: 'Route not found: {method} {path}',
  routeAccessDenied: 'Resource not found',
  controllerMethodNotFound: 'Method {methodName} not found on {controllerName}',
  controllerRegistration: 'Failed to register controller {controllerName}: {reason}',

  // Context errors
  contextNotInitialized: 'Context has not been initialized',
  userNotAuthenticated: 'User is not authenticated',
  insufficientPermissions: 'Insufficient permissions to perform this action',
  requestContainerNotInitialized: 'Request container has not been initialized',
  requestScopeOperationNotAllowed: '{methodName}() cannot be called on this container scope. Check if you are calling it on the correct container (global vs request-scoped).',
  conditionalBindingFallback: 'Conditional binding predicate returned false for token "{token}" but no fallback was provided and no existing registration exists.',

  // Configuration errors
  configNotInitialized: 'Configuration service has not been initialized',

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
  queueBindingNotFound: 'Queue binding {queueName} not found in environment',
  queueProviderNotSupported: 'Queue provider "{provider}" is not supported. Valid providers: cloudflare, sync',

  // Cron errors
  cronExecutionFailed: '{count} cron job(s) failed for schedule "{schedule}": {jobs}',

  // i18n errors
  localeNotSupported: "Locale '{locale}' is not supported. Supported locales: {supportedLocales}",
  translationMissing: "Translation missing for key '{key}' in locale '{locale}'",

  // Schema validation errors
  schemaValidation: 'Schema validation failed',

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
    providerNotSupported: 'Storage provider "{provider}" is not supported',
    responseBodyMissing: 'No body in storage response for path: {path}'
  },

  // Cache errors
  cache: {
    getFailed: "Failed to retrieve value from cache for key '{key}'",
    putFailed: "Failed to store value in cache for key '{key}'",
    deleteFailed: "Failed to delete value from cache for key '{key}'",
    listFailed: 'Failed to list cache keys'
  },

  // Authentication errors
  auth: {
    tokenRequired: 'Verification token is required',
    invalidToken: 'Invalid or expired verification token',
    verificationFailed: 'Verification failed. Please try again.',
    userNotFound: 'User not found. Please check your credentials.',
    invalidCredentials: 'Invalid email or password',
    invalidPassword: 'Invalid password',
    invalidEmail: 'Invalid email address',
    sessionExpired: 'Your session has expired. Please sign in again.',
    emailNotVerified: 'Please verify your email address before signing in',
    passwordTooShort: 'Password must be at least {minLength} characters',
    passwordTooLong: 'Password must be at most {maxLength} characters',
    accountAlreadyExists: 'An account with this email already exists',
    failedToCreateUser: 'Failed to create user account. Please try again.',
    failedToCreateSession: 'Failed to create session. Please try again.',
    failedToUpdateUser: 'Failed to update user information. Please try again.',
    socialAccountLinked: 'This social account is already linked to another user',
    providerNotFound: 'Authentication provider not found',
    userEmailNotFound: 'User email address not found',
    accountNotFound: 'Account not found',
    credentialAccountNotFound: 'Credential account not found',
    cannotUnlinkLastAccount: 'Cannot unlink your last account',
    userAlreadyHasPassword: 'User already has a password set',
    emailCannotBeUpdated: 'Email address cannot be updated at this time',
    tokenExpired: 'The verification token has expired. Please request a new verification email.'
  },

  // Migration errors
  migration: {
    failed: 'Migration {migrationName} failed: {error}',
    checksumMismatch: 'Migration {migrationName} checksum mismatch (expected: {expected}, actual: {actual})',
    alreadyApplied: 'Migration {migrationName} has already been applied',
    notFound: 'Migration {migrationName} not found',
  },
} as const
