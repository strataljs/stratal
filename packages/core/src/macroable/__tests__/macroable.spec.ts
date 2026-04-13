import { beforeEach, describe, expect, it } from 'vitest'
import { Macroable } from '../macroable'

class TestMacroable extends Macroable {
  value: string

  constructor(value: string) {
    super()
    this.value = value
  }

  existing(): string {
    return 'original'
  }
}

class ChildMacroable extends TestMacroable {
}

describe('Macroable', () => {
  beforeEach(() => {
    TestMacroable.flushMacros()
    ChildMacroable.flushMacros()
  })

  describe('macro()', () => {
    it('should register a callable method on instances', () => {
      TestMacroable.macro('greet', function (this: TestMacroable) {
        return `hello ${this.value}`
      })

      const instance = new TestMacroable('world')
      expect((instance as any).greet()).toBe('hello world')
    })

    it('should receive correct this context', () => {
      TestMacroable.macro('getValue', function (this: TestMacroable) {
        return this.value
      })

      const a = new TestMacroable('a')
      const b = new TestMacroable('b')
      expect((a as any).getValue()).toBe('a')
      expect((b as any).getValue()).toBe('b')
    })

    it('should accept arguments', () => {
      TestMacroable.macro('add', function (this: TestMacroable, suffix: string) {
        return `${this.value}-${suffix}`
      })

      const instance = new TestMacroable('hello')
      expect((instance as any).add('world')).toBe('hello-world')
    })

    it('should override an existing prototype method', () => {
      TestMacroable.macro('existing', function () {
        return 'overridden'
      })

      const instance = new TestMacroable('test')
      expect(instance.existing()).toBe('overridden')
    })

    it('should support symbol keys', () => {
      const sym = Symbol('test')
      TestMacroable.macro(sym, function (this: TestMacroable) {
        return this.value
      })

      const instance = new TestMacroable('symbol-test')
      expect((instance as any)[sym]()).toBe('symbol-test')
    })

    it('should support non-function values', () => {
      TestMacroable.macro('version', 'v1.0')

      const instance = new TestMacroable('test')
      expect((instance as any).version).toBe('v1.0')
    })
  })

  describe('instanceProperty()', () => {
    it('should register a per-instance bound function', () => {
      TestMacroable.instanceProperty('getVal', function (this: TestMacroable) {
        return this.value
      })

      const instance = new TestMacroable('bound')
      expect((instance as any).getVal()).toBe('bound')
    })

    it('should retain this binding when destructured', () => {
      TestMacroable.instanceProperty('getVal', function (this: TestMacroable) {
        return this.value
      })

      const instance = new TestMacroable('destructured')
      const { getVal } = instance as any
      expect(getVal()).toBe('destructured')
    })

    it('should assign non-function values directly', () => {
      TestMacroable.instanceProperty('config', { debug: true })

      const instance = new TestMacroable('test')
      expect((instance as any).config).toEqual({ debug: true })
    })

    it('should create independent copies per instance', () => {
      TestMacroable.instanceProperty('getVal', function (this: TestMacroable) {
        return this.value
      })

      const a = new TestMacroable('a')
      const b = new TestMacroable('b')
      const { getVal: getA } = a as any
      const { getVal: getB } = b as any
      expect(getA()).toBe('a')
      expect(getB()).toBe('b')
    })
  })

  describe('getter()', () => {
    it('should define a computed property', () => {
      let calls = 0
      TestMacroable.getter('upper', function (this: TestMacroable) {
        calls++
        return this.value.toUpperCase()
      })

      const instance = new TestMacroable('hello')
      expect((instance as any).upper).toBe('HELLO')
      expect((instance as any).upper).toBe('HELLO')
      expect(calls).toBe(2)
    })

    it('should cache after first access when singleton is true', () => {
      let calls = 0
      TestMacroable.getter('upper', function (this: TestMacroable) {
        calls++
        return this.value.toUpperCase()
      }, true)

      const instance = new TestMacroable('hello')
      expect((instance as any).upper).toBe('HELLO')
      expect((instance as any).upper).toBe('HELLO')
      expect(calls).toBe(1)
    })

    it('should cache independently per instance for singleton', () => {
      TestMacroable.getter('upper', function (this: TestMacroable) {
        return this.value.toUpperCase()
      }, true)

      const a = new TestMacroable('hello')
      const b = new TestMacroable('world')
      expect((a as any).upper).toBe('HELLO')
      expect((b as any).upper).toBe('WORLD')
    })
  })

  describe('hasMacro()', () => {
    it('should return true for registered macros', () => {
      TestMacroable.macro('test', () => {
        //
      })
      expect(TestMacroable.hasMacro('test')).toBe(true)
    })

    it('should return true for registered instance properties', () => {
      TestMacroable.instanceProperty('test', 'value')
      expect(TestMacroable.hasMacro('test')).toBe(true)
    })

    it('should return true for registered getters', () => {
      TestMacroable.getter('test', () => 'value')
      expect(TestMacroable.hasMacro('test')).toBe(true)
    })

    it('should return false for unregistered names', () => {
      expect(TestMacroable.hasMacro('nonexistent')).toBe(false)
    })
  })

  describe('flushMacros()', () => {
    it('should remove all registered macros, instance properties, and getters', () => {
      TestMacroable.macro('m', () => {
        //
      })
      TestMacroable.instanceProperty('ip', 'val')
      TestMacroable.getter('g', () => 'val')

      expect(TestMacroable.hasMacro('m')).toBe(true)
      expect(TestMacroable.hasMacro('ip')).toBe(true)
      expect(TestMacroable.hasMacro('g')).toBe(true)

      TestMacroable.flushMacros()

      expect(TestMacroable.hasMacro('m')).toBe(false)
      expect(TestMacroable.hasMacro('ip')).toBe(false)
      expect(TestMacroable.hasMacro('g')).toBe(false)
    })

    it('should not remove native class methods', () => {
      TestMacroable.macro('extra', () => {
        //
      })
      TestMacroable.flushMacros()

      const instance = new TestMacroable('test')
      expect(instance.existing()).toBe('original')
    })
  })

  describe('inheritance', () => {
    it('should allow subclass to inherit parent macros', () => {
      TestMacroable.macro('parentMethod', function (this: TestMacroable) {
        return this.value
      })

      const child = new ChildMacroable('inherited')
      expect((child as any).parentMethod()).toBe('inherited')
    })

    it('should not leak subclass macros to parent', () => {
      ChildMacroable.macro('childOnly', () => 'child')

      expect(ChildMacroable.hasMacro('childOnly')).toBe(true)
      expect(TestMacroable.hasMacro('childOnly')).toBe(false)
    })

    it('should allow subclass to override parent macros', () => {
      TestMacroable.macro('shared', () => 'parent')
      ChildMacroable.macro('shared', () => 'child')

      const parent = new TestMacroable('test')
      const child = new ChildMacroable('test')
      expect((parent as any).shared()).toBe('parent')
      expect((child as any).shared()).toBe('child')
    })

    it('should preserve instanceof checks', () => {
      const instance = new TestMacroable('test')
      expect(instance).toBeInstanceOf(TestMacroable)
      expect(instance).toBeInstanceOf(Macroable)

      const child = new ChildMacroable('test')
      expect(child).toBeInstanceOf(ChildMacroable)
      expect(child).toBeInstanceOf(TestMacroable)
      expect(child).toBeInstanceOf(Macroable)
    })

    it('should inherit parent instance properties', () => {
      TestMacroable.instanceProperty('parentProp', function (this: TestMacroable) {
        return this.value
      })

      const child = new ChildMacroable('inherited')
      expect((child as any).parentProp()).toBe('inherited')
    })

    it('should not leak subclass flushMacros to parent', () => {
      TestMacroable.macro('parentMacro', () => 'parent')
      ChildMacroable.macro('childMacro', () => 'child')

      ChildMacroable.flushMacros()

      expect(TestMacroable.hasMacro('parentMacro')).toBe(true)
      expect(ChildMacroable.hasMacro('childMacro')).toBe(false)
    })
  })
})
