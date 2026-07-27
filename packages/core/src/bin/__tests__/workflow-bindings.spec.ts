import { describe, expect, it } from 'vitest'
import { stripWorkflowBindings } from '../workflow-bindings'

describe('stripWorkflowBindings', () => {
  it('removes the workflows option and returns the binding names', () => {
    const workerOptions: Record<string, unknown> = {
      workflows: {
        MY_WORKFLOW: { name: 'my-workflow', className: 'MyWorkflow' },
        OTHER_WORKFLOW: { name: 'other-workflow', className: 'OtherWorkflow' },
      },
    }

    const removed = stripWorkflowBindings(workerOptions)

    expect(removed).toEqual(['MY_WORKFLOW', 'OTHER_WORKFLOW'])
    expect(workerOptions.workflows).toBeUndefined()
  })

  it('leaves other worker options untouched', () => {
    const workerOptions: Record<string, unknown> = {
      name: 'worker',
      bindings: { FOO: 'bar' },
      workflows: { MY_WORKFLOW: { name: 'my-workflow', className: 'MyWorkflow' } },
    }

    stripWorkflowBindings(workerOptions)

    expect(workerOptions.name).toBe('worker')
    expect(workerOptions.bindings).toEqual({ FOO: 'bar' })
  })

  it('is a no-op returning [] when the worker declares no workflows', () => {
    const workerOptions: Record<string, unknown> = { name: 'worker' }

    expect(stripWorkflowBindings(workerOptions)).toEqual([])
    expect(workerOptions.workflows).toBeUndefined()
  })
})
