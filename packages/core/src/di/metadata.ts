type MetadataTarget = object | string | symbol

const store = new WeakMap<object, Map<MetadataTarget, unknown>>()

function getKeyTarget(target: object, propertyKey?: string | symbol): object {
  if (propertyKey === undefined) return target
  let propMap = store.get(target)
  if (!propMap) {
    propMap = new Map()
    store.set(target, propMap)
  }
  let propTarget = propMap.get(propertyKey) as object | undefined
  if (!propTarget) {
    propTarget = Object.create(null) as object
    propMap.set(propertyKey, propTarget)
  }
  return propTarget
}

export function defineMetadata(key: symbol, value: unknown, target: object, propertyKey?: string | symbol): void {
  const resolved = getKeyTarget(target, propertyKey)
  let meta = store.get(resolved)
  if (!meta) {
    meta = new Map()
    store.set(resolved, meta)
  }
  meta.set(key, value)
}

export function getMetadata<T = unknown>(key: symbol, target: object, propertyKey?: string | symbol): T | undefined {
  const resolved = getKeyTarget(target, propertyKey)
  return store.get(resolved)?.get(key) as T | undefined
}

export function hasMetadata(key: symbol, target: object, propertyKey?: string | symbol): boolean {
  const resolved = getKeyTarget(target, propertyKey)
  return store.get(resolved)?.has(key) ?? false
}
