/**
 * Form validation messages - English
 */

export const validation = {
  required: 'This field is required',
  email: 'Invalid email address',
  minLength: 'Must be at least {min} characters',
  maxLength: 'Must not exceed {max} characters',
  min: 'Must be at least {min}',
  max: 'Must not exceed {max}',
  pattern: 'Invalid format',
  numeric: 'Must be a number',
  url: 'Invalid URL',
  date: 'Invalid date',
  passwordStrength: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  passwordMatch: 'Passwords do not match',
  unique: 'This value already exists',
  phone: 'Invalid phone number',
  fileRequired: 'Please upload a file',
  fileTooLarge: 'File must be smaller than {max}',
  invalidFileType: 'Please upload a PDF, JPG, or PNG file',
  schoolTypes: {
    required: 'School type is required',
    atLeastOne: 'Please select at least one school type',
    invalidCode: 'Invalid school type: {code}',
    notAvailableInCountry: '{schoolType} is not available in {country}',
    countryNotSupported: 'Country {country} is not supported'
  },
  timezone: {
    required: 'Timezone is required',
    invalid: 'Invalid timezone. Please select a valid IANA timezone.'
  },
  locale: {
    required: 'Language is required',
    invalid: 'Invalid language. Supported languages: {locales}'
  }
} as const
