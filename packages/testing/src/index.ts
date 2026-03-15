// Core Testing
export { ProviderOverrideBuilder, type ProviderOverrideConfig } from './core/override'
export { Test } from './core/test'
export { TestingModule } from './core/testing-module'
export { TestingModuleBuilder, type TestingModuleConfig } from './core/testing-module-builder'

// HTTP Testing
export { createMockFetch, MockFetch } from './core/http/mock-fetch'
export type { MockErrorOptions, MockJsonOptions } from './core/http/fetch-mock.types'
export { TestHttpClient } from './core/http/test-http-client'
export { TestHttpRequest } from './core/http/test-http-request'
export { TestResponse } from './core/http/test-response'

// WebSocket Testing
export { TestWsRequest } from './core/ws/test-ws-request'
export { TestWsConnection } from './core/ws/test-ws-connection'

// SSE Testing
export { TestSseRequest } from './core/sse/test-sse-request'
export { TestSseConnection } from './core/sse/test-sse-connection'
export type { TestSseEvent } from './core/sse/test-sse-connection'

// Re-export MSW utilities for convenience
export { http, HttpResponse } from 'msw'

// Auth
export { ActingAs } from './auth'

// Storage
export { FakeStorageService, type StoredFile } from './storage'

// Types
export { Seeder } from './types'

// Environment utilities
export { getTestEnv } from './core/env'

// Errors
export { TestError, TestSetupError } from './errors'
