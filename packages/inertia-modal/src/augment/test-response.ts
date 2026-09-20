import type { Page } from '@inertiajs/core'
import { getValueAtPath, TestResponse } from '@stratal/testing'
import { expect } from 'vitest'
import { isModalData, MODAL_BENEATH_PROP, MODAL_PROP, type ModalData } from '../core/wire'

declare module '@stratal/testing' {
  interface TestResponse {
    /** Assert a modal is open. The callback receives the level the response rendered. */
    assertModal(callback?: (level: ModalData) => void): Promise<this>
    /** Assert no modal is open. */
    assertNoModal(): Promise<this>
    /** Assert the component of the level this response rendered, or of the one at `depth`. */
    assertModalComponent(component: string, depth?: number): Promise<this>
    /** Assert what a level sits over — the page or modal route its `base` names. */
    assertModalBase(base: string, depth?: number): Promise<this>
    /** Assert where closing a level lands. */
    assertModalClose(close: string, depth?: number): Promise<this>
    /** Assert every open level's component, outermost first. Document responses only. */
    assertModalComponents(components: string[]): Promise<this>
    /** Assert how many levels are open. Document responses only. */
    assertModalCount(count: number): Promise<this>
    /** Assert the depth the level this response rendered sits at — 0 is outermost. */
    assertModalDepth(depth: number): Promise<this>
    /** Assert a level's prop at the given dot-path equals the expected value. */
    assertModalProp(path: string, expected: unknown, depth?: number): Promise<this>
    /** Assert the response carries the level alone, without the chain beneath it. */
    assertModalOnly(): Promise<this>
    /** Read back the level this response rendered, or the one at `depth`. */
    modalLevel<TProps = Record<string, unknown>>(depth?: number): Promise<ModalData<TProps>>
    /** Read back every open level, outermost first. Document responses only. */
    modalLevels<TProps = Record<string, unknown>>(): Promise<ModalData<TProps>[]>
  }
}

/**
 * What one response says about the open levels.
 *
 * `carriesChain` is false on an Inertia visit, which genuinely does not report what sits below —
 * the client holds that. The assertions that read the whole chain say so rather than letting a
 * one-level answer pass as a one-level stack.
 */
interface CarriedLevels {
  level: ModalData
  beneath: ModalData[]
  carriesChain: boolean
}

const LEVEL_ONLY = 'The response carries only the level it rendered, so it does not say how many levels are open. '
  + 'Assert that level with assertModalComponent(), or request the URL as a document to get the whole chain.'

function readModal(page: Page): CarriedLevels | null {
  const carried = page.props[MODAL_PROP]
  // Both readings of "no level here": a response that never carried one, and one that says the
  // level it dismissed is gone.
  if (carried === undefined || carried === null) return null

  if (!isModalData(carried)) {
    throw new Error(
      `The response carries a "${MODAL_PROP}" prop that is not a modal level. `
      + 'Something other than a modal route wrote to that prop name.',
    )
  }

  const beneath = page.props[MODAL_BENEATH_PROP]

  return { level: carried, beneath: beneath ?? [], carriesChain: beneath !== undefined && beneath !== null }
}

async function requireModal(response: TestResponse): Promise<CarriedLevels> {
  const carried = readModal(await response.json<Page>())

  if (carried === null) {
    throw new Error('Expected a modal to be open, but the response carries none.')
  }

  return carried
}

/** Every level the response reports, outermost first. */
function chainOf(carried: CarriedLevels): ModalData[] {
  if (!carried.carriesChain) throw new Error(LEVEL_ONLY)
  return [...carried.beneath, carried.level]
}

function levelAt(carried: CarriedLevels, depth: number | undefined): ModalData {
  if (depth === undefined) return carried.level

  const chain = chainOf(carried)
  const level = chain[depth]
  if (level === undefined) {
    throw new Error(`Expected a modal level at depth ${depth}, but the response carries ${chain.length}.`)
  }

  return level
}

export function augmentTestResponse(): void {
  TestResponse.macro('assertModal', async function (this: TestResponse, callback?: (level: ModalData) => void) {
    const carried = await requireModal(this)

    callback?.(carried.level)

    return this
  })

  TestResponse.macro('assertNoModal', async function (this: TestResponse) {
    const carried = readModal(await this.json<Page>())

    expect(
      carried,
      `Expected no modal to be open, but "${carried?.level.component}" is`,
    ).toBeNull()

    return this
  })

  TestResponse.macro('assertModalComponent', async function (this: TestResponse, component: string, depth?: number) {
    const carried = await requireModal(this)
    const level = levelAt(carried, depth)

    expect(
      level.component,
      `Expected the modal to be "${component}", got "${level.component}"`,
    ).toBe(component)

    return this
  })

  TestResponse.macro('assertModalBase', async function (this: TestResponse, base: string, depth?: number) {
    const level = levelAt(await requireModal(this), depth)

    expect(
      level.base,
      `Expected the modal to sit over "${base}", got "${level.base}"`,
    ).toBe(base)

    return this
  })

  TestResponse.macro('assertModalClose', async function (this: TestResponse, close: string, depth?: number) {
    const level = levelAt(await requireModal(this), depth)

    expect(
      level.close,
      `Expected closing the modal to land on "${close}", got "${level.close}"`,
    ).toBe(close)

    return this
  })

  TestResponse.macro('assertModalComponents', async function (this: TestResponse, components: string[]) {
    const actual = chainOf(await requireModal(this)).map((level) => level.component)

    expect(
      actual,
      `Expected the open modals to be ${JSON.stringify(components)} outermost first, got ${JSON.stringify(actual)}`,
    ).toStrictEqual(components)

    return this
  })

  TestResponse.macro('assertModalCount', async function (this: TestResponse, count: number) {
    const chain = chainOf(await requireModal(this))

    expect(
      chain.length,
      `Expected ${count} modal level(s) open, got ${chain.length}: ${JSON.stringify(chain.map((level) => level.component))}`,
    ).toBe(count)

    return this
  })

  TestResponse.macro('assertModalDepth', async function (this: TestResponse, depth: number) {
    const actual = chainOf(await requireModal(this)).length - 1

    expect(actual, `Expected the modal to be at depth ${depth}, got ${actual}`).toBe(depth)

    return this
  })

  TestResponse.macro('assertModalProp', async function (this: TestResponse, path: string, expected: unknown, depth?: number) {
    const carried = await requireModal(this)
    const level = levelAt(carried, depth)
    const actual = getValueAtPath(level.props, path)

    expect(
      actual,
      `Expected prop "${path}" of the modal to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    ).toStrictEqual(expected)

    return this
  })

  TestResponse.macro('assertModalOnly', async function (this: TestResponse) {
    const carried = await requireModal(this)

    expect(
      carried.carriesChain,
      'Expected the response to carry the level alone, but it assembled the chain beneath it. '
      + 'Only a document request renders what sits below.',
    ).toBe(false)

    return this
  })

  TestResponse.macro('modalLevel', async function (this: TestResponse, depth?: number) {
    return levelAt(await requireModal(this), depth)
  })

  TestResponse.macro('modalLevels', async function (this: TestResponse) {
    return chainOf(await requireModal(this))
  })
}
