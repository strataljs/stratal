import { Module } from 'stratal/module'

import {
  RolesAssignController,
  RolesController,
  RolesPermissionsController,
  RolesRevokeController,
} from './roles.controller'

@Module({
  controllers: [
    RolesController,
    RolesPermissionsController,
    RolesAssignController,
    RolesRevokeController,
  ],
})
export class RolesModule {}
