import type { InjectionToken } from '../types'

interface InjectionEntry {
  token: InjectionToken
  optional: boolean
}

const INJECTION_TOKENS = new WeakMap<object, Map<number, InjectionEntry>>()

export function inject<T>(
  token: InjectionToken<T>,
  options?: { isOptional?: boolean },
): ParameterDecorator {
  return (target: object, _propertyKey: string | symbol | undefined, parameterIndex: number) => {
    let params = INJECTION_TOKENS.get(target)
    if (!params) {
      params = new Map()
      INJECTION_TOKENS.set(target, params)
    }
    params.set(parameterIndex, { token, optional: options?.isOptional ?? false })
  }
}

export function getInjectionTokens(target: object): Map<number, InjectionEntry> {
  const direct = INJECTION_TOKENS.get(target)
  if (direct && direct.size > 0) return direct

  let proto = Object.getPrototypeOf(target) as object | null
  while (proto !== null && proto !== Function.prototype) {
    const inherited = INJECTION_TOKENS.get(proto)
    if (inherited && inherited.size > 0) return inherited
    proto = Object.getPrototypeOf(proto) as object | null
  }

  return new Map<number, InjectionEntry>()
}
