import 'stratal/polyfills'

// Core Testing
export { Test } from './core/test'
export { TestingModule } from './core/testing-module'
export { TestingModuleBuilder, type TestingModuleConfig } from './core/testing-module-builder'
export { ProviderOverrideBuilder, type ProviderOverrideConfig } from './core/override'

// HTTP Testing
export { TestHttpClient } from './core/http/test-http-client'
export { TestHttpRequest } from './core/http/test-http-request'
export { TestResponse } from './core/http/test-response'
export { FetchMock, createFetchMock } from './core/http/fetch-mock'
export type { MockJsonOptions, MockErrorOptions } from './core/http/fetch-mock.types'

// Storage
export { FakeStorageService, type StoredFile } from './storage'

// Environment utilities
export { getTestEnv } from './core/env'

// Errors
export { TestError, TestSetupError } from './errors'
