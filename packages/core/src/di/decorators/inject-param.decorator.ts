import type { InjectionToken } from '../types'
import { defineMetadata, getMetadata } from '../metadata'

export const INJECT_PARAM_METADATA_KEY = Symbol.for('stratal:inject:param')

export interface ParamInjection {
  index: number
  token: InjectionToken
}

export function InjectParam<T>(token: InjectionToken<T>): ParameterDecorator {
  return (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    if (propertyKey === undefined) {
      throw new Error('@InjectParam can only be used on method parameters, not constructor parameters')
    }

    const existing = getMetadata<ParamInjection[]>(INJECT_PARAM_METADATA_KEY, target, propertyKey) ?? []
    existing.push({ index: parameterIndex, token })
    defineMetadata(INJECT_PARAM_METADATA_KEY, existing, target, propertyKey)
  }
}

export function getMethodInjections(target: object, propertyKey: string | symbol): ParamInjection[] {
  const injections = getMetadata<ParamInjection[]>(INJECT_PARAM_METADATA_KEY, target, propertyKey) ?? []
  return injections.sort((a, b) => a.index - b.index)
}
