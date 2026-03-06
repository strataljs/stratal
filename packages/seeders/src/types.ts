import { type Constructor } from 'stratal'
import type { Seeder } from './seeder.js'

export interface SeederConfig {
  cwd: string
  wranglerPath: string
}

export type SeederMap = Record<string, Constructor<Seeder>>
