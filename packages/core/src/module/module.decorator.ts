import { defineMetadata, getMetadata, hasMetadata } from '../di/metadata'
import type { Constructor } from '../types'
import type { ModuleOptions } from './types'

export const MODULE_OPTIONS_KEY = Symbol.for('stratal:module:options')

export function Module(options: ModuleOptions) {
  return <TFunction extends abstract new (...args: never[]) => unknown>(target: TFunction): TFunction => {
    defineMetadata(MODULE_OPTIONS_KEY, options, target)
    return target
  }
}

export function getModuleOptions(target: Constructor): ModuleOptions | undefined {
  return getMetadata<ModuleOptions>(MODULE_OPTIONS_KEY, target)
}

export function isModuleClass(target: unknown): target is Constructor {
  return typeof target === 'function' && hasMetadata(MODULE_OPTIONS_KEY, target)
}
