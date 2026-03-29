import type { Page } from '@inertiajs/core'
import { getValueAtPath, hasValueAtPath, TestResponse } from '@stratal/testing'
import { expect } from 'vitest'

declare module '@stratal/testing' {
  interface TestResponse {
    /** Assert the response is an Inertia response. Optionally run a callback with the page object for custom assertions. */
    assertInertia(callback?: (page: Page) => void): Promise<this>
    /** Assert the Inertia page component matches the expected name. */
    assertInertiaComponent(component: string): Promise<this>
    /** Assert the Inertia page prop at the given dot-path equals the expected value. */
    assertInertiaProp(path: string, expected: unknown): Promise<this>
    /** Assert the Inertia page prop at the given dot-path exists. */
    assertInertiaPropExists(path: string): Promise<this>
    /** Assert the Inertia page prop at the given dot-path does not exist. */
    assertInertiaPropMissing(path: string): Promise<this>
    /** Assert the Inertia page URL matches the expected value. */
    assertInertiaUrl(url: string): Promise<this>
    /** Assert the Inertia page version matches the expected value. */
    assertInertiaVersion(version: string | null): Promise<this>
    /** Assert the Inertia page flash data contains the given key with the expected value. */
    assertInertiaFlash(key: string, value: unknown): Promise<this>
    /** Assert a prop is listed as deferred in the given group. */
    assertInertiaDeferredProp(prop: string, group: string): Promise<this>
    /** Assert a prop is listed as a merge prop. */
    assertInertiaMergeProp(prop: string): Promise<this>
    /** Assert a prop is listed as a shared prop. */
    assertInertiaSharedProp(prop: string): Promise<this>
    /** Assert the response is a successful precognition response (204 with precognition headers). */
    assertSuccessfulPrecognition(): this
    /** Assert the response is a precognition validation error (422 with precognition headers). Optionally assert specific errors. */
    assertPrecognitionValidationErrors(errors?: Record<string, string>): Promise<this>
  }
}

export function augmentTestResponse(): void {
  const proto = TestResponse.prototype

  proto.assertInertia = async function (this: TestResponse, callback?: (page: Page) => void) {
    this.assertHeader('x-inertia', 'true')
    this.assertOk()

    if (callback) {
      const page = await this.json<Page>()
      callback(page)
    }

    return this
  }

  proto.assertInertiaComponent = async function (this: TestResponse, component: string) {
    const page = await this.json<Page>()

    expect(
      page.component,
      `Expected Inertia component "${component}", got "${page.component}"`,
    ).toBe(component)

    return this
  }

  proto.assertInertiaProp = async function (this: TestResponse, path: string, expected: unknown) {
    const page = await this.json<Page>()
    const actual = getValueAtPath(page.props, path)

    expect(
      actual,
      `Expected Inertia prop "${path}" to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    ).toStrictEqual(expected)

    return this
  }

  proto.assertInertiaPropExists = async function (this: TestResponse, path: string) {
    const page = await this.json<Page>()
    const exists = hasValueAtPath(page.props, path)

    expect(
      exists,
      `Expected Inertia prop "${path}" to exist`,
    ).toBe(true)

    return this
  }

  proto.assertInertiaPropMissing = async function (this: TestResponse, path: string) {
    const page = await this.json<Page>()
    const exists = hasValueAtPath(page.props, path)

    expect(
      exists,
      `Expected Inertia prop "${path}" to not exist`,
    ).toBe(false)

    return this
  }

  proto.assertInertiaUrl = async function (this: TestResponse, url: string) {
    const page = await this.json<Page>()

    expect(
      page.url,
      `Expected Inertia URL "${url}", got "${page.url}"`,
    ).toBe(url)

    return this
  }

  proto.assertInertiaVersion = async function (this: TestResponse, version: string | null) {
    const page = await this.json<Page>()

    expect(
      page.version,
      `Expected Inertia version "${version}", got "${page.version}"`,
    ).toBe(version)

    return this
  }

  proto.assertInertiaFlash = async function (this: TestResponse, key: string, value: unknown) {
    const page = await this.json<Page>()
    const actual = page.flash?.[key]

    expect(
      actual,
      `Expected Inertia flash "${key}" to be ${JSON.stringify(value)}, got ${JSON.stringify(actual)}`,
    ).toStrictEqual(value)

    return this
  }

  proto.assertInertiaDeferredProp = async function (this: TestResponse, prop: string, group: string) {
    const page = await this.json<Page>()

    expect(
      page.deferredProps?.[group],
      `Expected Inertia deferred group "${group}" to contain "${prop}"`,
    ).toContain(prop)

    return this
  }

  proto.assertInertiaMergeProp = async function (this: TestResponse, prop: string) {
    const page = await this.json<Page>()

    expect(
      page.mergeProps,
      `Expected Inertia mergeProps to contain "${prop}"`,
    ).toContain(prop)

    return this
  }

  proto.assertInertiaSharedProp = async function (this: TestResponse, prop: string) {
    const page = await this.json<Page>()

    expect(
      page.sharedProps,
      `Expected Inertia sharedProps to contain "${prop}"`,
    ).toContain(prop)

    return this
  }

  proto.assertSuccessfulPrecognition = function (this: TestResponse) {
    this.assertNoContent()
    this.assertHeader('Precognition', 'true')
    this.assertHeader('Precognition-Success', 'true')

    return this
  }

  proto.assertPrecognitionValidationErrors = async function (this: TestResponse, errors?: Record<string, string>) {
    this.assertUnprocessable()
    this.assertHeader('Precognition', 'true')

    if (errors) {
      const body = await this.json<{ errors: Record<string, string> }>()

      expect(
        body.errors,
        `Expected precognition errors to match ${JSON.stringify(errors)}, got ${JSON.stringify(body.errors)}`,
      ).toStrictEqual(errors)
    }

    return this
  }
}
