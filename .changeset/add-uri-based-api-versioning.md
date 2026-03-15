---
"stratal": patch
---

Add URI-based API versioning support with configurable version prefix and default version

### Details

- **stratal**
  - Add `versioning` option to `ApplicationConfig` to enable URI-based versioning (e.g., `/v1/users`, `/v2/users`)
  - Add `version` option to `ControllerOptions` for per-controller version assignment (single, array, or `VERSION_NEUTRAL`)
  - Add `VERSION_NEUTRAL` sentinel symbol to opt controllers out of versioning even when a `defaultVersion` is set
  - Add `VersioningOptions` type with `prefix` (default `'v'`) and `defaultVersion` fields
  - Add `getControllerVersion()` helper exported from `stratal/router`
  - Extend `RouteRegistrationService` to resolve versioned paths for all route registration patterns (wildcard, OpenAPI, HTTP method, RESTful)
  - Extend `MiddlewareConfigurationService` to resolve versioned `RouteInfo` targets with `version` field
  - Add `version` field to `RouteInfo` middleware type for targeting versioned middleware routes
  - Export `VersioningOptions` and `VERSION_NEUTRAL` from `stratal/router`
