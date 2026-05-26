import type { InjectionToken } from './types'
import { Scope } from './types'

export {
  InjectParam,
  getMethodInjections,
  type ParamInjection,
  INJECT_PARAM_METADATA_KEY,
} from './decorators/inject-param.decorator'

export { inject, getInjectionTokens } from './decorators/inject.decorator'

interface ClassMetadata {
  scope: Scope
  token?: InjectionToken
}

const CLASS_METADATA = new WeakMap<object, ClassMetadata>()

function scopeDecorator(scope: Scope) {
  return <T>(token?: InjectionToken<T>) =>
    <TFunction extends abstract new (...args: never[]) => unknown>(target: TFunction): TFunction => {
      CLASS_METADATA.set(target, { scope, token })
      return target
    }
}

export const Singleton = scopeDecorator(Scope.Singleton)
export const Request = scopeDecorator(Scope.Request)
export const Transient = scopeDecorator(Scope.Transient)

export function getClassMetadata(target: object): ClassMetadata | undefined {
  return CLASS_METADATA.get(target)
}
