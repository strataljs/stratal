import { injectable, container as tsyringeRootContainer } from 'tsyringe'
import { bench, describe } from 'vitest'
import type { StratalEnv } from '../../env'
import { Container } from '../container'

// Test fixtures
@injectable()
class ServiceA { }

@injectable()
class ServiceB { }

@injectable()
class ServiceC { }

const TOKEN_A = Symbol('BenchTokenA')
const TOKEN_B = Symbol('BenchTokenB')
const TOKEN_C = Symbol('BenchTokenC')
const TOKEN_COND = Symbol('BenchTokenCond')

const mockCtx = {
  waitUntil: () => {
    //
  },
  passThroughOnException: () => {
    //
  },
} as unknown as ExecutionContext

function createContainer(): Container {
  return new Container({
    env: {} as StratalEnv,
    ctx: mockCtx,
    container: tsyringeRootContainer.createChildContainer(),
  })
}

describe('Container - Registration', () => {
  bench('register class provider', () => {
    const container = createContainer()
    container.register(ServiceA)
  })

  bench('registerSingleton', () => {
    const container = createContainer()
    container.registerSingleton(TOKEN_A, ServiceA)
  })

  bench('registerValue', () => {
    const container = createContainer()
    container.registerValue(TOKEN_B, { data: 'test' })
  })

  bench('registerFactory', () => {
    const container = createContainer()
    container.registerFactory(TOKEN_C, () => new ServiceA())
  })
})

describe('Container - Resolution', () => {
  function createPreloadedContainer(): Container {
    const container = createContainer()
    container.register(ServiceA)
    container.register(TOKEN_A, ServiceA)
    container.registerValue(TOKEN_B, { data: 'test' })
    container.registerSingleton(TOKEN_C, ServiceC)
    return container
  }

  bench('resolve class token', () => {
    const container = createPreloadedContainer()
    container.resolve(ServiceA)
  })

  bench('resolve symbol token', () => {
    const container = createPreloadedContainer()
    container.resolve(TOKEN_A)
  })

  bench('resolve value token', () => {
    const container = createPreloadedContainer()
    container.resolve(TOKEN_B)
  })

  bench('resolve singleton token', () => {
    const container = createPreloadedContainer()
    container.resolve(TOKEN_C)
  })

  bench('isRegistered check', () => {
    const container = createPreloadedContainer()
    container.isRegistered(TOKEN_A)
  })
})

describe('Container - Conditional Binding', () => {
  bench('when().use().give().otherwise()', () => {
    const container = createContainer()
    container
      .when(() => true)
      .use(TOKEN_COND)
      .give(ServiceA)
      .otherwise(ServiceB)
  })

  bench('when() with cached predicate', () => {
    const container = createContainer()
    container
      .when(() => true, { cache: true })
      .use(TOKEN_COND)
      .give(ServiceA)
      .otherwise(ServiceB)
  })
})
