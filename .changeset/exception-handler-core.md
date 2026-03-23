---
"stratal": patch
---

Add `ExceptionHandler` with customizable error reporting, rendering, and throttling support

### Details

- Introduce `ExceptionHandler` base class with `report()`, `render()`, `shouldReport()`, and `throttle()` hooks
- Add `HttpException` class for structured HTTP error responses with fluent API
- Add `ExceptionContext` for collecting contextual metadata during error handling
- Replace `GlobalErrorHandler` with the new `ExceptionHandler` pipeline
- Add `stratal` as a CLI bin alias for `quarry`
- Streamline OpenAPI service and routing metadata handling
