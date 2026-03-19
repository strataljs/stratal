---
"@stratal/testing": patch
---

Add test utilities for Quarry command framework

### Details

- Add `TestCommandRequest` fluent builder for constructing command inputs in tests
- Add `TestCommandResult` assertion wrapper for command output, exit codes, and errors
- Add `quarry(name)` method to `TestingModule` for convenient command testing
- Export new utilities from `@stratal/testing` main entry point
