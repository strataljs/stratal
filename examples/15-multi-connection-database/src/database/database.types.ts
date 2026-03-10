import type { SchemaType as MainSchemaType } from '../../db/main/schema'
import type { SchemaType as AnalyticsSchemaType } from '../../db/analytics/schema'

declare module '@stratal/framework/database' {
  interface StratalDatabase {
    schemas: {
      main: MainSchemaType
      analytics: AnalyticsSchemaType
    }
    defaultConnection: 'main'
  }
}
