/**
 * French translations fixture for integration tests
 *
 * Mirrors the nested structure of core English messages
 * for the keys exercised by the localization integration tests.
 */

export const frenchMessages = {
  errors: {
    routeNotFound: 'Route introuvable : {method} {path}',
    schemaValidation: 'La validation du schéma a échoué',
  },
  zodI18n: {
    errors: {
      required: 'Requis',
      invalid_type: 'Type attendu {expected}, reçu {received}',
      too_small: {
        string: {
          inclusive: 'Doit comporter au moins {minimum} caractères',
        },
      },
    },
  },
}
