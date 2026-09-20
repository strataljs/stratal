import { describe, expect, it } from 'vitest'
import { stripModuleRules } from '../module-rules'

describe('stripModuleRules', () => {
  it('removes the modulesRules option and reports the removal', () => {
    const workerOptions: Record<string, unknown> = {
      modulesRules: [
        { type: 'Text', include: ['**/*.txt', '**/*.html', '**/*.sql'] },
        { type: 'CompiledWasm', include: ['**/*.wasm'] },
      ],
    }

    expect(stripModuleRules(workerOptions)).toBe(true)
    expect('modulesRules' in workerOptions).toBe(false)
  })

  it('leaves other worker options untouched', () => {
    const workerOptions: Record<string, unknown> = {
      name: 'worker',
      bindings: { FOO: 'bar' },
      modulesRules: [{ type: 'Data', include: ['**/*.bin'] }],
    }

    stripModuleRules(workerOptions)

    expect(workerOptions.name).toBe('worker')
    expect(workerOptions.bindings).toEqual({ FOO: 'bar' })
  })

  it('is a no-op returning false when the worker declares no module rules', () => {
    const workerOptions: Record<string, unknown> = { name: 'worker' }

    expect(stripModuleRules(workerOptions)).toBe(false)
    expect('modulesRules' in workerOptions).toBe(false)
  })

  // The converter's guard is `'modulesRules' in worker && !== undefined`, so an
  // explicitly-undefined key already passes it — deleting it would be churn.
  it('leaves an explicitly undefined modulesRules in place', () => {
    const workerOptions: Record<string, unknown> = { modulesRules: undefined }

    expect(stripModuleRules(workerOptions)).toBe(false)
    expect('modulesRules' in workerOptions).toBe(true)
  })
})
