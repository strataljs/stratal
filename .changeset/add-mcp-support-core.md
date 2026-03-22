---
"stratal": patch
---

Add MCP server support and API CLI commands

### Details

- Add `mcp:serve` command to start a stdio MCP server that exposes OpenAPI routes as tools
- Add `mcp:tools` command to list available MCP tools derived from the OpenAPI spec
- Add `api` command to invoke API endpoints directly from the CLI
- Add `OpenApiToolsService` for converting OpenAPI specs into tool definitions, reusable across MCP, CLI, and custom tooling
