import 'reflect-metadata'

import { QuarryRunner } from 'stratal/quarry'
import { AppModule } from '../app.module'

QuarryRunner.run(AppModule)
