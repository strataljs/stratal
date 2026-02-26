/**
 * Zod validation error messages - English
 *
 * Comprehensive messages for all Zod validation error codes
 * Structured to match Zod's issue types and validation contexts
 */

export const zodI18n = {
  errors: {
    // General errors
    required: 'Required',
    invalid_type: 'Expected {expected}, received {received}',
    invalid_literal: 'Invalid literal value, expected {expected}',
    custom: {
      default: 'Invalid value',
      // Email validation
      emailOrTextRequired: 'Either html or text content must be provided',
      invalidFromEmail: 'Invalid from email address',
      // Storage validation
      fileInstanceRequired: 'File must be a File instance',
      filePathRequired: 'File path is required',
      diskNameRequired: 'Disk name is required',
      endpointRequired: 'Endpoint URL is required for S3',
      bucketNameRequired: 'Bucket name is required',
      accessKeyRequired: 'Access key ID is required',
      secretKeyRequired: 'Secret access key is required',
      storageDiskRequired: 'At least one storage disk is required',
      // Database validation
      databaseUrlRequired: 'Database URL is required',
      // Domain validation
      domainRequired: 'Domain is required',
      domainTooLong: 'Domain too long',
      invalidDomainFormat: 'Invalid domain format',
    },
    invalid_union: 'Invalid input',
    invalid_union_discriminator: 'Invalid discriminator value. Expected {options}',
    invalid_enum_value: 'Invalid enum value. Expected {options}, received {received}',
    unrecognized_keys: 'Unrecognized key(s) in object: {keys}',
    invalid_arguments: 'Invalid function arguments',
    invalid_return_type: 'Invalid function return type',
    invalid_date: 'Invalid date',
    invalid_intersection_types: 'Intersection results could not be merged',
    not_multiple_of: 'Number must be a multiple of {multipleOf}',
    not_finite: 'Number must be finite',

    // String-specific validation errors
    invalid_string: {
      email: 'Invalid email address',
      url: 'Invalid URL',
      uuid: 'Invalid UUID',
      cuid: 'Invalid CUID',
      cuid2: 'Invalid CUID2',
      ulid: 'Invalid ULID',
      regex: 'Invalid format',
      datetime: 'Invalid datetime',
      ip: 'Invalid IP address',
      emoji: 'Invalid emoji',
      startsWith: 'Must start with "{startsWith}"',
      endsWith: 'Must end with "{endsWith}"',
      includes: 'Must include "{includes}"',
      base64: 'Invalid Base64',
      nanoid: 'Invalid NanoID',
      cidr: 'Invalid CIDR',
      jwt: 'Invalid JWT',
      time: 'Invalid time',
    },

    // Size validation errors (strings, arrays, numbers)
    too_small: {
      string: {
        exact: 'Must be exactly {minimum} characters',
        inclusive: 'Must be at least {minimum} characters',
        not_inclusive: 'Must be more than {minimum} characters',
      },
      number: {
        exact: 'Must be exactly {minimum}',
        inclusive: 'Must be at least {minimum}',
        not_inclusive: 'Must be greater than {minimum}',
      },
      array: {
        exact: 'Must contain exactly {minimum} item(s)',
        inclusive: 'Must contain at least {minimum} item(s)',
        not_inclusive: 'Must contain more than {minimum} item(s)',
      },
      set: {
        exact: 'Must contain exactly {minimum} item(s)',
        inclusive: 'Must contain at least {minimum} item(s)',
        not_inclusive: 'Must contain more than {minimum} item(s)',
      },
      date: {
        exact: 'Date must be {minimum}',
        inclusive: 'Date must be {minimum} or later',
        not_inclusive: 'Date must be after {minimum}',
      },
      bigint: {
        exact: 'Must be exactly {minimum}',
        inclusive: 'Must be at least {minimum}',
        not_inclusive: 'Must be greater than {minimum}',
      },
    },

    too_big: {
      string: {
        exact: 'Must be exactly {maximum} characters',
        inclusive: 'Must be at most {maximum} characters',
        not_inclusive: 'Must be less than {maximum} characters',
      },
      number: {
        exact: 'Must be exactly {maximum}',
        inclusive: 'Must be at most {maximum}',
        not_inclusive: 'Must be less than {maximum}',
      },
      array: {
        exact: 'Must contain exactly {maximum} item(s)',
        inclusive: 'Must contain at most {maximum} item(s)',
        not_inclusive: 'Must contain less than {maximum} item(s)',
      },
      set: {
        exact: 'Must contain exactly {maximum} item(s)',
        inclusive: 'Must contain at most {maximum} item(s)',
        not_inclusive: 'Must contain less than {maximum} item(s)',
      },
      date: {
        exact: 'Date must be {maximum}',
        inclusive: 'Date must be {maximum} or earlier',
        not_inclusive: 'Date must be before {maximum}',
      },
      bigint: {
        exact: 'Must be exactly {maximum}',
        inclusive: 'Must be at most {maximum}',
        not_inclusive: 'Must be less than {maximum}',
      },
    },
  },
} as const
