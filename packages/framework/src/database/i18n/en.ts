export const databaseI18n = {
  database: {
    connectionNameRequired: 'Connection name is required',
    defaultConnectionRequired: 'Default connection name is required',
    connectionRequired: 'At least one connection is required',
    duplicateConnections: 'Duplicate connection names found',
    defaultConnectionNotFound: 'Default connection not found in connections',
  },
} as const

declare module 'stratal/i18n' {
  interface AppMessages {
    database: typeof databaseI18n['database']
  }
}
