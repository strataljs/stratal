import type { AccessControl, Role, Statements } from 'better-auth/plugins/access';

export type RolePermissions<TStatements extends Statements> = {
  [K in keyof TStatements]?: readonly TStatements[K][number][]
}

export interface AccessControlOptions<TStatements extends Statements = Statements, TRoles extends Record<string, RolePermissions<TStatements>> = Record<string, RolePermissions<TStatements>>> {
  ac: AccessControl<TStatements>;
  roles: { [K in keyof TRoles]: Role }
}
