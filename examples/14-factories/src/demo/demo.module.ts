import { Module } from 'stratal/module'

import {
  DemoAdminsController,
  DemoExpensiveProductsController,
  DemoMixedController,
  DemoProductsController,
  DemoUsersController,
} from './demo.controller'

@Module({
  controllers: [
    DemoUsersController,
    DemoAdminsController,
    DemoProductsController,
    DemoExpensiveProductsController,
    DemoMixedController,
  ],
})
export class DemoModule {}
