import type { AccessControl, Role, Statements } from 'better-auth/plugins/access'

export interface AccessControlOptions<TStatements extends Statements = Statements> {
  ac: AccessControl<TStatements>
  roles: Record<string, Role<TStatements>>
}
