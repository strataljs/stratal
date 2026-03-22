---
"stratal": minor
---

Support multiple seeder names in `db:seed` command via variadic `{names*}` argument

### Details

- Change `db:seed {name?}` to `db:seed {names*}` to accept multiple seeder class names in a single invocation
- When `--all` is used with named seeders, warn and ignore the names
- Iterate over all provided names, running each seeder sequentially
